// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { PiSessionIndex, resolvePiSessionDir } from "./pi-sessions.js";

const directories: string[] = [];

function makeSessionDir() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pi-graph-chat-sessions-"));
  directories.push(directory);
  return directory;
}

const usage = {
  input: 10,
  output: 5,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 15,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function assistant(
  content: Array<
    | { type: "text"; text: string }
    | { type: "thinking"; thinking: string }
    | { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> }
  >,
  model = "claude-sonnet-5",
) {
  return {
    role: "assistant" as const,
    content,
    api: "anthropic-messages" as const,
    provider: "anthropic",
    model,
    usage,
    stopReason: "stop" as const,
    timestamp: Date.now(),
  };
}

function seedBranchedSession(sessionDir: string) {
  // Session files live in a per-cwd subdirectory, like Pi's own layout.
  const projectDir = path.join(sessionDir, "--home-user-demo--");
  fs.mkdirSync(projectDir, { recursive: true });
  const manager = SessionManager.create("/home/user/demo", projectDir);
  manager.appendModelChange("anthropic", "claude-sonnet-5");
  const firstPrompt = manager.appendMessage({
    role: "user",
    content: "What is RAG?",
    timestamp: Date.now(),
  });
  manager.appendMessage(
    assistant([
      { type: "thinking", thinking: "Look at the graph first." },
      { type: "toolCall", id: "call-1", name: "read", arguments: { path: "notes.md" } },
    ]),
  );
  manager.appendMessage({
    role: "toolResult",
    toolCallId: "call-1",
    toolName: "read",
    content: [{ type: "text", text: "RAG notes" }],
    isError: false,
    timestamp: Date.now(),
  });
  const firstAnswer = manager.appendMessage(
    assistant([{ type: "text", text: "RAG is retrieval augmented generation." }]),
  );
  manager.appendMessage({
    role: "user",
    content: "Explain embeddings",
    timestamp: Date.now(),
  });
  manager.appendMessage(assistant([{ type: "text", text: "Embeddings are vectors." }]));
  manager.branch(firstAnswer);
  manager.appendMessage({
    role: "user",
    content: [{ type: "text", text: "Explain vector databases" }],
    timestamp: Date.now(),
  });
  manager.appendMessage(assistant([{ type: "text", text: "They index vectors." }], "claude-opus-5"));
  manager.appendLabelChange(firstPrompt, "start");
  manager.appendSessionInfo("RAG study");
  return { manager, firstPrompt, firstAnswer };
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("resolvePiSessionDir", () => {
  it("prefers the explicit session directory, then the agent directory, then the home default", () => {
    expect(resolvePiSessionDir({ PI_CODING_AGENT_SESSION_DIR: "/tmp/explicit" })).toBe(
      path.resolve("/tmp/explicit"),
    );
    expect(resolvePiSessionDir({ PI_CODING_AGENT_DIR: "/tmp/agent" })).toBe(
      path.join(path.resolve("/tmp/agent"), "sessions"),
    );
    expect(resolvePiSessionDir({})).toBe(path.join(os.homedir(), ".pi", "agent", "sessions"));
  });
});

describe("PiSessionIndex", () => {
  it("lists sessions across project directories with names and first prompts", () => {
    const sessionDir = makeSessionDir();
    seedBranchedSession(sessionDir);
    const index = new PiSessionIndex(sessionDir);
    const sessions = index.list();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      cwd: "/home/user/demo",
      name: "RAG study",
      firstPrompt: "What is RAG?",
      turnCount: 3,
      provider: "anthropic",
      model: "claude-opus-5",
      parentSessionPath: null,
    });
    expect(sessions[0]!.path.endsWith(".jsonl")).toBe(true);
  });

  it("collapses entries into prompt turns while keeping every branch point", () => {
    const sessionDir = makeSessionDir();
    const { firstPrompt, firstAnswer } = seedBranchedSession(sessionDir);
    const index = new PiSessionIndex(sessionDir);
    const tree = index.get(index.list()[0]!.id);
    expect(tree).not.toBeNull();
    const turns = tree!.turns;
    expect(turns.map((turn) => turn.kind)).toEqual(["user", "user", "user"]);

    const root = turns[0]!;
    expect(root.parentId).toBeNull();
    expect(root.prompt).toBe("What is RAG?");
    expect(root.response).toBe("RAG is retrieval augmented generation.");
    expect(root.thinking).toBe("Look at the graph first.");
    expect(root.label).toBe("start");
    expect(root.model).toBe("claude-sonnet-5");
    expect(root.toolCalls).toEqual([
      {
        id: "call-1",
        name: "read",
        arguments: JSON.stringify({ path: "notes.md" }, null, 2),
        result: "RAG notes",
        isError: false,
      },
    ]);
    // The leading model_change entry and the prompt belong to the same turn.
    expect(root.entryIds).toContain(firstPrompt);
    expect(root.entryIds).toContain(firstAnswer);

    const children = turns.filter((turn) => turn.parentId === root.id);
    expect(children.map((turn) => turn.title)).toEqual([
      "Explain embeddings",
      "Explain vector databases",
    ]);
    const abandoned = children[0]!;
    const active = children[1]!;
    expect(abandoned.onActivePath).toBe(false);
    expect(active.onActivePath).toBe(true);
    expect(active.isLeaf).toBe(true);
    expect(active.model).toBe("claude-opus-5");
    expect(tree!.leafTurnId).toBe(active.id);
    expect(root.onActivePath).toBe(true);
  });

  it("reuses cached parses until a session file changes and drops deleted files", () => {
    const sessionDir = makeSessionDir();
    const { manager } = seedBranchedSession(sessionDir);
    const index = new PiSessionIndex(sessionDir);
    const before = index.list()[0]!;
    expect(index.get(before.id)!.turns).toHaveLength(3);

    manager.appendMessage({ role: "user", content: "One more question", timestamp: Date.now() });
    const file = manager.getSessionFile()!;
    const bumped = new Date(Date.now() + 2_000);
    fs.utimesSync(file, bumped, bumped);
    expect(index.get(before.id)!.turns).toHaveLength(4);
    expect(index.list()[0]!.turnCount).toBe(4);

    fs.rmSync(file);
    expect(index.list()).toEqual([]);
    expect(index.get(before.id)).toBeNull();
  });

  it("keeps summaries for every session but parsed trees only for recent ones", () => {
    const sessionDir = makeSessionDir();
    for (let index = 0; index < 12; index += 1) {
      const projectDir = path.join(sessionDir, `--project-${index}--`);
      fs.mkdirSync(projectDir, { recursive: true });
      const manager = SessionManager.create(`/home/user/project-${index}`, projectDir, { id: `session-${index}` });
      manager.appendMessage({ role: "user", content: `Question ${index}`, timestamp: Date.now() });
      manager.appendMessage(assistant([{ type: "text", text: `Answer ${index}` }]));
    }
    const index = new PiSessionIndex(sessionDir);
    expect(index.list()).toHaveLength(12);
    for (let n = 0; n < 12; n += 1) expect(index.get(`session-${n}`)?.turns).toHaveLength(1);
    const cache = (index as unknown as { cache: Map<string, { tree: unknown }> }).cache;
    expect([...cache.values()].filter((entry) => entry.tree).length).toBe(8);
    // Evicted trees are re-parsed on demand.
    expect(index.get("session-0")?.turns).toHaveLength(1);
  });

  it("skips files that are not Pi sessions", () => {
    const sessionDir = makeSessionDir();
    fs.writeFileSync(path.join(sessionDir, "broken.jsonl"), "{not json\n");
    fs.writeFileSync(path.join(sessionDir, "headless.jsonl"), '{"type":"message","id":"a"}\n');
    seedBranchedSession(sessionDir);
    expect(new PiSessionIndex(sessionDir).list()).toHaveLength(1);
  });
});
