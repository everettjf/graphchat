// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import graphchatExtension, {
  GRAPH_BINDING_ENTRY,
  REFERENCE_MESSAGE_TYPE,
} from "./graphchat.js";

type Registered = {
  tools: Map<string, any>;
  commands: Map<string, any>;
  entries: Array<{ type: string; data: unknown }>;
  messages: Array<{ message: any; options: any }>;
};

function fakePi(): { pi: any; registered: Registered } {
  const registered: Registered = { tools: new Map(), commands: new Map(), entries: [], messages: [] };
  const pi = {
    registerTool: (tool: any) => registered.tools.set(tool.name, tool),
    registerCommand: (name: string, options: any) => registered.commands.set(name, options),
    appendEntry: (customType: string, data: unknown) => registered.entries.push({ type: customType, data }),
    sendMessage: (message: any, options: any) => registered.messages.push({ message, options }),
    on: () => () => undefined,
  };
  return { pi, registered };
}

function fakeContext(sessionId: string, branch: Array<{ type: string; customType?: string; data?: unknown }> = []) {
  const notifications: Array<[string, string | undefined]> = [];
  const ctx = {
    hasUI: false,
    ui: {
      notify: (message: string, type?: string) => notifications.push([message, type]),
      select: async () => undefined,
    },
    sessionManager: {
      getSessionId: () => sessionId,
      getBranch: () => branch,
    },
  };
  return { ctx, notifications };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const graph = { id: "learning-rag", title: "Understanding RAG", description: "" };
const node = {
  id: "embedding",
  graphId: "learning-rag",
  title: "What exactly is an embedding?",
  prompt: "",
  content: "An embedding gives text semantic coordinates.",
  summary: "Semantic coordinates.",
  sourceUrl: "",
};

describe("graphchat Pi extension", () => {
  it("stays silent when loaded inside the Pi Graph Chat server", () => {
    const { pi, registered } = fakePi();
    graphchatExtension(pi, { env: { GRAPHCHAT_EMBEDDED: "1" } });
    expect(registered.tools.size).toBe(0);
    expect(registered.commands.size).toBe(0);
  });

  it("registers graph tools and commands", () => {
    const { pi, registered } = fakePi();
    graphchatExtension(pi, { env: {} });
    expect([...registered.tools.keys()].sort()).toEqual(["graph_get_node", "graph_search"]);
    expect([...registered.commands.keys()].sort()).toEqual(["graph", "ref"]);
  });

  it("scopes graph_search to the graph behind the current session", async () => {
    const { pi, registered } = fakePi();
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/graphs/by-session/graphchat-learning-rag")) return jsonResponse(graph);
      if (url.includes("/api/graphs/learning-rag/search?q=embedding")) return jsonResponse({ nodes: [node] });
      throw new Error(`Unexpected request: ${url}`);
    });
    graphchatExtension(pi, { env: {}, baseUrl: "http://graphchat.test", fetch: fetchMock as typeof fetch });
    const { ctx } = fakeContext("graphchat-learning-rag");
    const result = await registered.tools.get("graph_search").execute("call", { query: "embedding" }, undefined, undefined, ctx);
    expect(result.details).toEqual({ resultCount: 1 });
    expect(result.content[0].text).toContain("[Node: embedding] Understanding RAG · What exactly is an embedding?");
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      "http://graphchat.test/api/graphs/by-session/graphchat-learning-rag",
      "http://graphchat.test/api/graphs/learning-rag/search?q=embedding",
    ]);
  });

  it("searches every graph for a plain terminal session and honors /graph use", async () => {
    const { pi, registered } = fakePi();
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/graphs/by-session/plain-session")) return jsonResponse({ message: "no" }, 404);
      if (url.includes("/api/search?q=vector")) return jsonResponse({ results: [{ node, graph }] });
      if (url.endsWith("/api/graphs/learning-rag")) return jsonResponse(graph);
      if (url.includes("/api/graphs/learning-rag/search?q=vector")) return jsonResponse({ nodes: [node] });
      throw new Error(`Unexpected request: ${url}`);
    });
    graphchatExtension(pi, { env: {}, baseUrl: "http://graphchat.test", fetch: fetchMock as typeof fetch });
    const { ctx, notifications } = fakeContext("plain-session");
    const global = await registered.tools.get("graph_search").execute("call", { query: "vector" }, undefined, undefined, ctx);
    expect(global.content[0].text).toContain("Understanding RAG · What exactly");

    await registered.commands.get("graph").handler("use learning-rag", ctx);
    expect(registered.entries).toEqual([{ type: GRAPH_BINDING_ENTRY, data: { graphId: "learning-rag" } }]);
    expect(notifications.at(-1)?.[0]).toContain("Understanding RAG");

    const bound = fakeContext("plain-session", [{ type: "custom", customType: GRAPH_BINDING_ENTRY, data: { graphId: "learning-rag" } }]);
    await registered.tools.get("graph_search").execute("call", { query: "vector" }, undefined, undefined, bound.ctx);
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toBe("http://graphchat.test/api/graphs/learning-rag/search?q=vector");
  });

  it("opens the web app for the session and injects references", async () => {
    const { pi, registered } = fakePi();
    const opened: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/graphs/by-session/graphchat-learning-rag")) return jsonResponse(graph);
      if (url.endsWith("/api/nodes/embedding")) return jsonResponse(node);
      if (url.endsWith("/api/nodes/similarity")) return jsonResponse({ message: "no" }, 404);
      if (url.includes("/api/graphs/learning-rag/search?q=similarity")) return jsonResponse({ nodes: [node] });
      throw new Error(`Unexpected request: ${url}`);
    });
    graphchatExtension(pi, {
      env: {},
      baseUrl: "http://graphchat.test",
      fetch: fetchMock as typeof fetch,
      openUrl: (url) => opened.push(url),
    });
    const { ctx, notifications } = fakeContext("graphchat-learning-rag");
    await registered.commands.get("graph").handler("", ctx);
    expect(opened).toEqual(["http://graphchat.test/?graph=learning-rag"]);

    await registered.commands.get("ref").handler("embedding", ctx);
    expect(registered.messages).toHaveLength(1);
    expect(registered.messages[0]!.message).toMatchObject({
      customType: REFERENCE_MESSAGE_TYPE,
      display: true,
      details: { nodeIds: ["embedding"] },
    });
    expect(registered.messages[0]!.message.content).toContain("[Node: embedding]");
    expect(registered.messages[0]!.options).toEqual({ triggerTurn: false });

    await registered.commands.get("ref").handler("similarity", ctx);
    expect(registered.messages).toHaveLength(2);
    expect(notifications.at(-1)?.[0]).toContain("Referenced");
  });

  it("reports a stopped server instead of throwing", async () => {
    const { pi, registered } = fakePi();
    const fetchMock = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    graphchatExtension(pi, { env: {}, baseUrl: "http://graphchat.test", fetch: fetchMock as unknown as typeof fetch });
    const { ctx, notifications } = fakeContext("plain-session");
    await registered.commands.get("graph").handler("status", ctx);
    expect(notifications.at(-1)).toEqual([expect.stringContaining("not reachable"), "error"]);
  });
});
