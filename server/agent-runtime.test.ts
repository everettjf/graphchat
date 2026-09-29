// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseSessionEntries, SessionManager } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import type { RunStreamEvent } from "../shared/types.js";
import { GraphAgentRuntime } from "./agent-runtime.js";
import { GraphDatabase } from "./database.js";
import { PiSessionIndex } from "./pi-sessions.js";

const directories: string[] = [];

async function setup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "graphchat-runtime-"));
  directories.push(directory);
  const dataDirectory = path.join(directory, "data");
  const agentDir = path.join(directory, "agent");
  const sessionRoot = path.join(directory, "sessions");
  const database = new GraphDatabase(dataDirectory);
  const runtime = await GraphAgentRuntime.create(
    { provider: "demo", model: "graphchat-guide", baseUrl: "", hasApiKey: false },
    { dataDirectory, agentDir, sessionRoot, sessionIndex: new PiSessionIndex(sessionRoot) },
  );
  return { database, runtime, sessionRoot, agentDir };
}

function baseRequest(overrides: Partial<Parameters<GraphAgentRuntime["run"]>[1]> = {}) {
  return {
    graphId: "learning-rag",
    parentNodeId: "root-rag" as string | null,
    relationKind: "branch" as const,
    referenceNodeIds: [] as string[],
    prompt: "解释这段知识",
    selectedText: null as string | null,
    position: { x: 900, y: 400 },
    mode: "answer" as const,
    locale: "zh" as const,
    externalReferences: [] as Parameters<GraphAgentRuntime["run"]>[1]["externalReferences"],
    ...overrides,
  };
}

async function collect(runtime: GraphAgentRuntime, database: GraphDatabase, request: ReturnType<typeof baseRequest>) {
  const events: RunStreamEvent[] = [];
  for await (const event of runtime.run(database, request)) events.push(event);
  return events;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("GraphAgentRuntime", () => {
  it("keeps API keys in memory and scopes them to their provider", async () => {
    const { database, runtime } = await setup();
    await runtime.configure(
      {
        provider: "custom",
        model: "private-model",
        baseUrl: "http://127.0.0.1:8080/v1",
        hasApiKey: true,
      },
      "session-only-secret",
    );
    expect(runtime.hasApiKey("custom")).toBe(true);
    expect(runtime.hasApiKey("demo")).toBe(false);
    expect(database.getSettings().hasApiKey).toBe(false);
    database.close();
  });

  it("picks up a catalog provider's API key from the environment", async () => {
    const previous = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "environment-test-key";
    try {
      const { database, runtime, agentDir } = await setup();
      expect(runtime.hasApiKey("deepseek")).toBe(true);
      expect(runtime.hasApiKey("openrouter")).toBe(Boolean(process.env.OPENROUTER_API_KEY));
      expect(runtime.modelRuntime.getModel("deepseek", "deepseek-flash")).toBeTruthy();
      // The key stays in the environment: nothing is written to Pi's credential file.
      const authPath = path.join(agentDir, "auth.json");
      expect(fs.existsSync(authPath) ? fs.readFileSync(authPath, "utf8") : "").not.toContain(
        "environment-test-key",
      );
      database.close();
    } finally {
      if (previous === undefined) delete process.env.DEEPSEEK_API_KEY;
      else process.env.DEEPSEEK_API_KEY = previous;
    }
  });

  it("streams a Pi-backed demo answer and persists the final node", async () => {
    const { database, runtime } = await setup();
    const events = await collect(
      runtime,
      database,
      baseRequest({
        parentNodeId: "embedding",
        referenceNodeIds: ["vector-db"],
        prompt: "这两个概念如何配合？",
        position: { x: 1200, y: 200 },
        mode: "synthesize",
      }),
    );
    const started = events.find((event) => event.type === "run_started");
    const finished = events.find((event) => event.type === "run_finished");
    expect(started?.type).toBe("run_started");
    expect(events.filter((event) => event.type === "text_delta").length).toBeGreaterThan(2);
    expect(finished?.type).toBe("run_finished");
    if (started?.type === "run_started" && finished?.type === "run_finished") {
      expect(finished.runId).toBe(started.runId);
      expect(finished.nodeId).toBe(started.nodeId);
      expect(
        events
          .filter((event) => event.type === "text_delta")
          .every((event) => event.runId === started.runId && event.nodeId === started.nodeId),
      ).toBe(true);
      const persisted = database.getNode(finished.node.id);
      expect(persisted?.content).toContain("把这些分支");
      expect(persisted?.contextSnapshot).toMatchObject({
        estimatedTokens: expect.any(Number),
        items: expect.arrayContaining([
          expect.objectContaining({ nodeId: "embedding" }),
          expect.objectContaining({ nodeId: "vector-db", reason: "reference" }),
        ]),
      });
    }
    database.close();
  });

  it("backs the graph with a Pi session whose tree mirrors the graph branches", async () => {
    const { database, runtime, sessionRoot } = await setup();
    const first = await collect(runtime, database, baseRequest({ parentNodeId: "embedding" }));
    const firstNode = first.find((event) => event.type === "run_finished");
    expect(firstNode?.type).toBe("run_finished");

    const graph = database.getGraph("learning-rag")!;
    expect(graph.graph.piSessionPath).toBeTruthy();
    expect(graph.graph.piSessionPath!.startsWith(sessionRoot)).toBe(true);
    expect(fs.existsSync(graph.graph.piSessionPath!)).toBe(true);

    // Every seeded node was synced into the session before the run.
    const seeded = graph.nodes.filter((node) => node.id !== firstNode!.nodeId);
    expect(seeded.every((node) => Boolean(node.piEntryId))).toBe(true);
    const answered = database.getNode(firstNode!.nodeId!)!;
    expect(answered.piEntryId).toBeTruthy();

    const manager = SessionManager.open(graph.graph.piSessionPath!);
    expect(manager.getSessionName()).toBe(graph.graph.title);
    const embedding = manager.getEntry(graph.nodes.find((node) => node.id === "embedding")!.piEntryId!);
    expect(embedding?.type).toBe("message");
    // The new prompt hangs off the parent's answer entry.
    const branch = manager.getBranch(answered.piEntryId!);
    expect(branch.some((entry) => entry.id === embedding!.id)).toBe(true);
    const root = graph.nodes.find((node) => node.id === "root-rag")!;
    expect(branch.some((entry) => entry.id === root.piEntryId)).toBe(true);
    const vectorDb = graph.nodes.find((node) => node.id === "vector-db")!;
    expect(branch.some((entry) => entry.id === vectorDb.piEntryId)).toBe(false);

    // A second answer from another parent reuses the same session file.
    const second = await collect(runtime, database, baseRequest({ parentNodeId: "vector-db", prompt: "再解释一次" }));
    const secondNode = database.getNode(second.find((e) => e.type === "run_finished")!.nodeId!)!;
    expect(database.getGraph("learning-rag")!.graph.piSessionPath).toBe(graph.graph.piSessionPath);
    const reopened = SessionManager.open(graph.graph.piSessionPath!);
    const secondBranch = reopened.getBranch(secondNode.piEntryId!);
    expect(secondBranch.some((entry) => entry.id === vectorDb.piEntryId)).toBe(true);
    expect(secondBranch.some((entry) => entry.id === answered.piEntryId)).toBe(false);

    // The read-only Pi session index sees the graph session too.
    const index = new PiSessionIndex(sessionRoot);
    const listed = index.list().find((session) => session.id === "graphchat-learning-rag");
    expect(listed?.name).toBe(graph.graph.title);
    expect(listed!.turnCount).toBeGreaterThanOrEqual(8);
    database.close();
  });

  it("serializes concurrent runs on one graph without replaying synced nodes", async () => {
    const { database, runtime } = await setup();
    const [first, second] = await Promise.all([
      collect(runtime, database, baseRequest({ parentNodeId: "embedding", prompt: "第一问" })),
      collect(runtime, database, baseRequest({ parentNodeId: "vector-db", prompt: "第二问" })),
    ]);
    expect(first.at(-1)?.type).toBe("run_finished");
    expect(second.at(-1)?.type).toBe("run_finished");
    const graph = database.getGraph("learning-rag")!;
    const entries = parseSessionEntries(fs.readFileSync(graph.graph.piSessionPath!, "utf8"));
    const userPrompts = entries
      .filter((entry) => entry.type === "message" && entry.message.role === "user")
      .map((entry) => (entry.type === "message" ? JSON.stringify(entry.message.content) : ""));
    const seededPrompt = userPrompts.filter((text) => text.includes("Explain RAG in plain language"));
    expect(seededPrompt).toHaveLength(1);
    expect(userPrompts.filter((text) => text.includes("第一问"))).toHaveLength(1);
    expect(userPrompts.filter((text) => text.includes("第二问"))).toHaveLength(1);
    database.close();
  });

  it("loads the user's Pi skills and extensions into graph runs", async () => {
    const { database, runtime, agentDir } = await setup();
    fs.mkdirSync(path.join(agentDir, "skills", "demo-skill"), { recursive: true });
    fs.writeFileSync(
      path.join(agentDir, "skills", "demo-skill", "SKILL.md"),
      "---\nname: demo-skill\ndescription: Demo skill for tests.\n---\n\n# Demo\n",
    );
    fs.mkdirSync(path.join(agentDir, "extensions"), { recursive: true });
    const marker = path.join(agentDir, "extension-ran.txt");
    fs.writeFileSync(
      path.join(agentDir, "extensions", "marker.ts"),
      `import fs from "node:fs";
export default function marker(pi) {
  pi.on("session_start", () => { fs.writeFileSync(${JSON.stringify(marker)}, "ok"); });
  pi.registerTool({
    name: "marker_tool", label: "Marker", description: "test",
    parameters: { type: "object", properties: {} },
    execute: async () => ({ content: [{ type: "text", text: "ok" }], details: {} }),
  });
}
`,
    );
    const events = await collect(runtime, database, baseRequest({ locale: "en" }));
    expect(events.at(-1)?.type).toBe("run_finished");
    expect(fs.existsSync(marker)).toBe(true);
    const graph = database.getGraph("learning-rag")!;
    const entries = parseSessionEntries(fs.readFileSync(graph.graph.piSessionPath!, "utf8"));
    const system = entries.find((entry) => entry.type === "message" && entry.message.role === "system");
    const systemText = system?.type === "message" ? JSON.stringify(system.message) : "";
    expect(systemText).toContain("demo-skill");
    expect(systemText).toContain("learning partner");
    database.close();
  });

  it("injects references and selected text as a context entry instead of rewriting the prompt", async () => {
    const { database, runtime } = await setup();
    const events = await collect(
      runtime,
      database,
      baseRequest({
        parentNodeId: "embedding",
        referenceNodeIds: ["vector-db"],
        selectedText: "semantic coordinates",
        prompt: "How do these relate?",
        locale: "en",
        mode: "synthesize",
      }),
    );
    const finished = events.find((event) => event.type === "run_finished");
    expect(finished?.type).toBe("run_finished");
    const graph = database.getGraph("learning-rag")!;
    const entries = parseSessionEntries(fs.readFileSync(graph.graph.piSessionPath!, "utf8"));
    const reference = entries.find(
      (entry) => entry.type === "custom_message" && entry.customType === "graphchat.references",
    );
    expect(reference).toBeTruthy();
    if (reference?.type === "custom_message") {
      expect(String(reference.content)).toContain("vector-db");
      expect(String(reference.content)).toContain("semantic coordinates");
      expect(String(reference.content)).not.toContain("Explain RAG in plain language");
    }
    const userEntries = entries.filter(
      (entry) => entry.type === "message" && entry.message.role === "user",
    );
    const last = userEntries.at(-1);
    expect(last?.type === "message" && JSON.stringify(last.message.content)).toContain("How do these relate?");
    expect(last?.type === "message" && JSON.stringify(last.message.content)).not.toContain("graph context");
    database.close();
  });

  it("executes a graph tool in explore mode before answering", async () => {
    const { database, runtime } = await setup();
    const events = await collect(
      runtime,
      database,
      baseRequest({ prompt: "向量数据库", position: { x: 500, y: 500 }, mode: "explore" }),
    );
    const eventTypes = events.map((event) => event.type);
    expect(eventTypes).toContain("tool_started");
    expect(eventTypes).toContain("tool_finished");
    expect(eventTypes.at(-1)).toBe("run_finished");

    const started = events.find((event) => event.type === "tool_started");
    const finished = events.find((event) => event.type === "tool_finished");
    expect(started?.type === "tool_started" && started.call).toMatchObject({
      name: "graph_search",
      result: "",
    });
    const last = events.at(-1);
    const stored = last?.type === "run_finished" ? database.getNode(last.node.id) : null;
    expect(last?.type === "run_finished" && last.node.toolCalls).toEqual(stored?.toolCalls);
    expect(stored?.toolCalls).toHaveLength(1);
    expect(stored?.toolCalls[0]).toMatchObject({
      id: finished?.type === "tool_finished" ? finished.call?.id : undefined,
      name: "graph_search",
      isError: false,
    });
    expect(JSON.parse(stored!.toolCalls[0]!.arguments)).toEqual({ query: "向量数据库" });
    expect(stored!.toolCalls[0]!.result.length).toBeGreaterThan(0);
    database.close();
  });

  it("answers in English when the application locale is English", async () => {
    const { database, runtime } = await setup();
    const events = await collect(
      runtime,
      database,
      baseRequest({
        parentNodeId: "embedding",
        referenceNodeIds: ["vector-db"],
        prompt: "How do these concepts work together?",
        position: { x: 1200, y: 200 },
        mode: "synthesize",
        locale: "en",
      }),
    );
    const finished = events.find((event) => event.type === "run_finished");
    expect(finished?.type === "run_finished" && finished.node.content).toContain("Put the branches on one map");
    expect(finished?.type === "run_finished" && finished.node.content).not.toContain("Back to the main thread");
    expect(finished?.type === "run_finished" && finished.node.summary).toBeTruthy();
    database.close();
  });

  it("roots a graph in a codebase: session lives in the project and read-only tools are on", async () => {
    const { database, runtime, sessionRoot } = await setup();
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "graphchat-project-"));
    directories.push(projectDir);
    fs.writeFileSync(path.join(projectDir, "README.md"), "# Demo project\n");
    const created = database.createGraph({ title: "Code graph", description: "", projectDir });
    const events = await collect(
      runtime,
      database,
      baseRequest({ graphId: created.graph.id, parentNodeId: null, prompt: "What does this repo do?", locale: "en" }),
    );
    expect(events.at(-1)?.type).toBe("run_finished");
    // Read-only built-ins plus the graph tools; never bash, edit, or write.
    expect(runtime.lastRunToolNames.sort()).toEqual([
      "find",
      "graph_get_node",
      "graph_search",
      "grep",
      "ls",
      "read",
    ]);

    const graph = database.getGraph(created.graph.id)!;
    expect(graph.graph.projectDir).toBe(projectDir);
    expect(path.dirname(graph.graph.piSessionPath!)).toBe(
      path.join(sessionRoot, `--${projectDir.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`),
    );
    const entries = parseSessionEntries(fs.readFileSync(graph.graph.piSessionPath!, "utf8"));
    expect(entries[0]).toMatchObject({ type: "session", cwd: projectDir });
    const system = entries.find((entry) => entry.type === "message" && entry.message.role === "system");
    const systemText = system?.type === "message" ? JSON.stringify(system.message) : "";
    expect(systemText).toContain(projectDir);
    expect(systemText).toContain("grep");

    // A plain graph only exposes `read` (for skills) plus the graph tools.
    await collect(runtime, database, baseRequest({ locale: "en" }));
    expect(runtime.lastRunToolNames.sort()).toEqual(["graph_get_node", "graph_search", "read"]);
    database.close();
  });

  it("resolves references to other graphs and to Pi session turns", async () => {
    const { database, runtime, sessionRoot } = await setup();
    // A terminal Pi session in another project.
    const otherProject = path.join(sessionRoot, "--home-user-other--");
    fs.mkdirSync(otherProject, { recursive: true });
    const terminal = SessionManager.create("/home/user/other", otherProject, { id: "terminal-session" });
    terminal.appendMessage({ role: "user", content: "Why did the deploy fail?", timestamp: Date.now() });
    terminal.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "The health check timed out because the port was wrong." }],
      api: "openai-completions",
      provider: "demo",
      model: "demo",
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "stop",
      timestamp: Date.now(),
    });
    const turnId = terminal.getBranch()[0]!.id;
    // A second graph that references a node from the seeded graph.
    const other = database.createGraph({ title: "Ops notes", description: "" });
    const events = await collect(
      runtime,
      database,
      baseRequest({
        graphId: other.graph.id,
        parentNodeId: null,
        prompt: "Connect the deploy failure to what I know about embeddings.",
        locale: "en",
        externalReferences: [
          { kind: "node", nodeId: "embedding" },
          { kind: "pi-turn", sessionId: "terminal-session", turnId },
          { kind: "node", nodeId: "missing-node" },
        ],
      }),
    );
    const finished = events.find((event) => event.type === "run_finished");
    expect(finished?.type).toBe("run_finished");
    const node = database.getNode(finished!.nodeId!)!;
    const titles = node.contextSnapshot!.items.map((item) => item.title);
    expect(titles).toContain("Understanding RAG: from new concepts to a complete picture · What exactly is an embedding?");
    expect(titles.some((title) => title.startsWith("Pi · ") && title.includes("Why did the deploy fail?"))).toBe(true);
    expect(node.contextSnapshot!.items.map((item) => item.nodeId)).toContain(`pi:terminal-session/${turnId}`);
    expect(node.contextSnapshot!.items).toHaveLength(2);

    const entries = parseSessionEntries(fs.readFileSync(database.getGraph(other.graph.id)!.graph.piSessionPath!, "utf8"));
    const reference = entries.find((entry) => entry.type === "custom_message" && entry.customType === "graphchat.references");
    expect(reference?.type === "custom_message" ? String(reference.content) : "").toContain("health check timed out");
    expect(reference?.type === "custom_message" ? String(reference.content) : "").toContain("semantic coordinates");
    database.close();
  });

  it("requires ChatGPT login before running an OpenAI Codex model", async () => {
    const { database, runtime } = await setup();
    await runtime.configure({
      provider: "openai-codex",
      model: "gpt-5.5",
      baseUrl: "",
      hasApiKey: false,
    });
    const events = await collect(runtime, database, baseRequest());
    expect(events.at(-1)).toEqual(
      expect.objectContaining({
        type: "run_failed",
        message: "请先在“模型与设置”中使用 ChatGPT 登录。",
        runId: expect.any(String),
        nodeId: expect.any(String),
        node: expect.objectContaining({ status: "error" }),
      }),
    );
    database.close();
  });

  it("requires an API key before running a catalog provider", async () => {
    const { database, runtime } = await setup();
    await runtime.configure({
      provider: "anthropic",
      model: "claude-sonnet-5",
      baseUrl: "",
      hasApiKey: false,
    });
    const events = await collect(runtime, database, baseRequest({ locale: "en" }));
    expect(events.at(-1)).toEqual(
      expect.objectContaining({
        type: "run_failed",
        message: expect.stringContaining("ANTHROPIC_API_KEY"),
      }),
    );
    database.close();
  });

  it("explains an unreachable Ollama within seconds instead of after Pi's retries", async () => {
    const { database, runtime } = await setup();
    await runtime.configure({ provider: "ollama", model: "qwen3.5:4b", baseUrl: "http://127.0.0.1:1/v1", hasApiKey: false });
    const startedAt = Date.now();
    const events = await collect(runtime, database, baseRequest({ locale: "en" }));
    expect(Date.now() - startedAt).toBeLessThan(6_000);
    expect(events.at(-1)).toMatchObject({
      type: "run_failed",
      message: expect.stringContaining("Ollama did not respond at http://127.0.0.1:1/v1"),
    });
    database.close();
  });

  it("refuses to run a graph whose project directory disappeared", async () => {
    const { database, runtime } = await setup();
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "graphchat-gone-"));
    const created = database.createGraph({ title: "Gone", description: "", projectDir });
    fs.rmSync(projectDir, { recursive: true, force: true });
    const events = await collect(runtime, database, baseRequest({ graphId: created.graph.id, parentNodeId: null, locale: "en" }));
    expect(events.at(-1)).toMatchObject({
      type: "run_failed",
      message: expect.stringContaining("no longer exists"),
    });
    database.close();
  });

  it("marks an aborted run as cancelled and keeps its run identity", async () => {
    const { database, runtime } = await setup();
    const controller = new AbortController();
    const events: RunStreamEvent[] = [];
    for await (const event of runtime.run(
      database,
      baseRequest({ prompt: "取消这次生成", position: { x: 600, y: 600 } }),
      controller.signal,
    )) {
      events.push(event);
      if (event.type === "text_delta" && !controller.signal.aborted) controller.abort();
    }
    const started = events.find((event) => event.type === "run_started");
    const cancelled = events.find((event) => event.type === "run_cancelled");
    expect(started?.type).toBe("run_started");
    expect(cancelled?.type).toBe("run_cancelled");
    if (started?.type === "run_started" && cancelled?.type === "run_cancelled") {
      expect(cancelled.runId).toBe(started.runId);
      expect(cancelled.nodeId).toBe(started.nodeId);
      expect(database.getNode(started.nodeId)?.status).toBe("cancelled");
      // The interrupted answer Pi persisted is mapped to the node.
      expect(database.getNode(started.nodeId)?.piEntryId).toBeTruthy();
    }
    expect(events.some((event) => event.type === "run_finished")).toBe(false);
    database.close();
  });
});
