// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { TOOL_CALL_RESULT_LIMIT } from "../shared/tool-calls.js";
import { GraphDatabase } from "./database.js";
import { GraphSessionSync, importSessionTurnsIntoGraph, openGraphSession } from "./graph-session.js";

const directories: string[] = [];

function setup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "graphchat-session-sync-"));
  directories.push(directory);
  const database = new GraphDatabase(path.join(directory, "data"));
  const sessionRoot = path.join(directory, "sessions");
  const graph = database.getGraph("learning-rag")!;
  const { manager } = openGraphSession(database, graph, { cwd: path.join(directory, "data"), sessionRoot });
  return { database, manager, sessionRoot, directory };
}

const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function terminalTurn(manager: SessionManager, prompt: string, answer: string | null) {
  manager.appendMessage({ role: "user", content: prompt, timestamp: Date.now() });
  if (answer === null) return;
  manager.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: answer }],
    api: "openai-completions",
    provider: "terminal",
    model: "terminal-model",
    usage,
    stopReason: "stop",
    timestamp: Date.now(),
  });
}

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("importSessionTurnsIntoGraph", () => {
  it("creates nodes for turns added in the terminal under the right parents, once", () => {
    const { database, manager } = setup();
    const embedding = database.getNode("embedding")!;
    expect(embedding.piEntryId).toBeTruthy();

    // Continue from the embedding answer in the terminal, twice in a row, then
    // start an unanswered prompt from the root.
    manager.branch(embedding.piEntryId!);
    terminalTurn(manager, "Terminal question one", "Terminal answer one");
    terminalTurn(manager, "Terminal question two", "Terminal answer two");
    manager.branch(database.getNode("root-rag")!.piEntryId!);
    terminalTurn(manager, "Still typing in the terminal", null);

    const reopened = SessionManager.open(manager.getSessionFile()!);
    const created = importSessionTurnsIntoGraph(database, database.getGraph("learning-rag")!, reopened);
    expect(created.map((node) => node.title)).toEqual(["Terminal question one", "Terminal question two"]);
    expect(created[0]).toMatchObject({
      prompt: "Terminal question one",
      content: "Terminal answer one",
      provider: "terminal",
      model: "terminal-model",
      status: "complete",
      tags: ["pi-terminal"],
    });
    const graph = database.getGraph("learning-rag")!;
    const edgeOne = graph.edges.find((edge) => edge.target === created[0]!.id);
    const edgeTwo = graph.edges.find((edge) => edge.target === created[1]!.id);
    expect(edgeOne).toMatchObject({ source: "embedding", kind: "continuation" });
    expect(edgeTwo).toMatchObject({ source: created[0]!.id, kind: "continuation" });
    expect(created.every((node) => Boolean(node.piEntryId))).toBe(true);
    expect(graph.nodes.some((node) => node.prompt === "Still typing in the terminal")).toBe(false);

    // Idempotent on the same file.
    expect(importSessionTurnsIntoGraph(database, graph, SessionManager.open(manager.getSessionFile()!))).toEqual([]);
    database.close();
  });

  it("does not re-import turns whose nodes were deleted or undone", () => {
    const { database, manager } = setup();
    manager.branch(database.getNode("embedding")!.piEntryId!);
    terminalTurn(manager, "Delete me later", "Answer");
    const [imported] = importSessionTurnsIntoGraph(database, database.getGraph("learning-rag")!, SessionManager.open(manager.getSessionFile()!));
    expect(imported?.piEntryId).toBeTruthy();

    // Deleting the node hides its turn from future syncs.
    expect(database.deleteNode(imported!.id)).toBe(true);
    expect(importSessionTurnsIntoGraph(database, database.getGraph("learning-rag")!, SessionManager.open(manager.getSessionFile()!))).toEqual([]);

    // Undo keeps every surviving node mapped to its entry, and hides undone nodes' turns.
    const before = database.getGraph("learning-rag")!;
    const mapped = before.nodes.filter((node) => node.piEntryId).length;
    expect(mapped).toBeGreaterThan(0);
    manager.branch(database.getNode("vector-db")!.piEntryId!);
    terminalTurn(manager, "Undo me", "Answer two");
    const [undone] = importSessionTurnsIntoGraph(database, before, SessionManager.open(manager.getSessionFile()!));
    expect(undone).toBeTruthy();
    const restored = database.undoGraph("learning-rag")!;
    expect(restored.nodes.some((node) => node.id === undone!.id)).toBe(false);
    expect(restored.nodes.filter((node) => node.piEntryId).length).toBe(mapped);
    expect(importSessionTurnsIntoGraph(database, restored, SessionManager.open(manager.getSessionFile()!))).toEqual([]);
    database.close();
  });

  it("links unmapped nodes to their turns and never imports interrupted answers", () => {
    const { database, manager } = setup();
    // An older node whose mapping was lost: same prompt exists as a turn in the session.
    const root = database.getNode("root-rag")!;
    database.setNodePiEntry("embedding", null);
    // An interrupted answer in the terminal (Pi persists it with stopReason "aborted").
    manager.branch(root.piEntryId!);
    manager.appendMessage({ role: "user", content: "Interrupted question", timestamp: Date.now() });
    manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "partial" }],
      api: "openai-completions",
      provider: "terminal",
      model: "terminal-model",
      usage,
      stopReason: "aborted",
      timestamp: Date.now(),
    });
    const before = database.getGraph("learning-rag")!;
    const created = importSessionTurnsIntoGraph(database, before, SessionManager.open(manager.getSessionFile()!));
    expect(created).toEqual([]);
    expect(database.getNode("embedding")?.piEntryId).toBeTruthy();
    expect(database.getGraph("learning-rag")!.nodes).toHaveLength(before.nodes.length);
    database.close();
  });

  it("keeps a node's entry mapping across undo even when the snapshot predates it", () => {
    const { database, manager } = setup();
    const before = database.getGraph("learning-rag")!;
    const own = database.getNode("similarity")!.piEntryId!;
    // Snapshot (via a revision-recording update) while the node still has no entry.
    database.setNodePiEntry("similarity", null);
    database.updateNode("similarity", { rating: 1 });
    database.setNodePiEntry("similarity", own);
    const restored = database.undoGraph("learning-rag")!;
    expect(restored.nodes.find((node) => node.id === "similarity")?.piEntryId).toBe(own);
    expect(importSessionTurnsIntoGraph(database, restored, SessionManager.open(manager.getSessionFile()!))).toEqual([]);
    expect(database.getGraph("learning-rag")!.nodes).toHaveLength(before.nodes.length);
    database.close();
  });

  it("records the tools a terminal turn ran, with long results cut to a summary", () => {
    const { database, manager } = setup();
    manager.branch(database.getNode("embedding")!.piEntryId!);
    manager.appendMessage({ role: "user", content: "Read the notes", timestamp: Date.now() });
    manager.appendMessage({
      role: "assistant",
      content: [{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "notes.md" } }],
      api: "openai-completions",
      provider: "terminal",
      model: "terminal-model",
      usage,
      stopReason: "toolUse",
      timestamp: Date.now(),
    });
    manager.appendMessage({
      role: "toolResult",
      toolCallId: "call-1",
      toolName: "read",
      content: [{ type: "text", text: "x".repeat(10_000) }],
      isError: true,
      timestamp: Date.now(),
    });
    manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "The notes could not be read." }],
      api: "openai-completions",
      provider: "terminal",
      model: "terminal-model",
      usage,
      stopReason: "stop",
      timestamp: Date.now(),
    });

    const [created] = importSessionTurnsIntoGraph(
      database,
      database.getGraph("learning-rag")!,
      SessionManager.open(manager.getSessionFile()!),
    );
    const stored = database.getNode(created!.id)!;
    expect(stored.toolCalls).toHaveLength(1);
    expect(stored.toolCalls[0]).toMatchObject({ id: "call-1", name: "read", isError: true });
    expect(JSON.parse(stored.toolCalls[0]!.arguments)).toEqual({ path: "notes.md" });
    expect(stored.toolCalls[0]!.result).toHaveLength(TOOL_CALL_RESULT_LIMIT);
    database.close();
  });

  it("syncs on read only when the session file changed and never while a run is active", () => {
    const { database, manager } = setup();
    let busy = false;
    const sync = new GraphSessionSync(database, () => busy);
    const before = database.getGraph("learning-rag")!;
    expect(sync.sync(before).nodes).toHaveLength(before.nodes.length);

    manager.branch(database.getNode("vector-db")!.piEntryId!);
    terminalTurn(manager, "Terminal question", "Terminal answer");
    const bumped = new Date(Date.now() + 5_000);
    fs.utimesSync(manager.getSessionFile()!, bumped, bumped);

    busy = true;
    expect(sync.sync(database.getGraph("learning-rag")!).nodes).toHaveLength(before.nodes.length);
    busy = false;
    const after = sync.sync(database.getGraph("learning-rag")!);
    expect(after.nodes).toHaveLength(before.nodes.length + 1);
    expect(after.nodes.find((node) => node.prompt === "Terminal question")).toBeTruthy();
    // Unchanged file: no re-parse, no new nodes.
    expect(sync.sync(after).nodes).toHaveLength(after.nodes.length);
    database.close();
  });
});
