import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import {
  createGraphSchema,
  createNodeSchema,
  graphBackupSchema,
  importTextSchema,
  providerSettingsSchema,
  runRequestSchema,
  type ProviderSettings,
  updateGraphSchema,
  updateNodeSchema,
  updateGraphLayoutSchema,
} from "../shared/types.js";
import { APP_VERSION, DATABASE_SCHEMA_VERSION } from "../shared/version.js";
import { GraphAgentRuntime } from "./agent-runtime.js";
import { GraphDatabase } from "./database.js";
import { OpenAICodexAuthManager } from "./openai-codex-auth.js";
import { GraphSessionSync, isAppSessionId, removeGraphSessionFile } from "./graph-session.js";
import { PiSessionIndex, resolvePiSessionDir } from "./pi-sessions.js";
import { configureSystemProxy } from "./system-proxy.js";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

const app = Fastify({ logger: { level: process.env.NODE_ENV === "test" ? "silent" : "info" } });
const usingSystemProxy = await configureSystemProxy();
const dataDirectory = path.resolve(process.env.PI_GRAPH_CHAT_DATA_DIR || ".pi-graph-chat");
const database = new GraphDatabase(dataDirectory);
const piSessionDir = resolvePiSessionDir();
const piSessions = new PiSessionIndex(piSessionDir);
const runtime = await GraphAgentRuntime.create(database.getSettings(), {
  dataDirectory,
  sessionRoot: piSessionDir,
  sessionIndex: piSessions,
});
const activeRunControllers = new Map<string, AbortController>();
const codexAuth = new OpenAICodexAuthManager(runtime.modelRuntime);
// Turns added to a graph's session from the terminal become nodes on the next read.
const sessionSync = new GraphSessionSync(database, (graphId) => runtime.isRunning(graphId));

/** Resolve and validate a graph's project directory, or explain why it is unusable. */
function resolveProjectDir(value: string | null | undefined): { projectDir: string | null } | { error: string } {
  if (value === undefined || value === null || value.trim() === "") return { projectDir: null };
  const resolved = path.resolve(value.trim());
  try {
    if (!fs.statSync(resolved).isDirectory()) return { error: `Not a directory: ${resolved}` };
  } catch {
    return { error: `Project directory does not exist: ${resolved}` };
  }
  return { projectDir: resolved };
}
const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const productionClientDirectory = process.env.PI_GRAPH_CHAT_CLIENT_DIR
  ? path.resolve(process.env.PI_GRAPH_CHAT_CLIENT_DIR)
  : path.resolve(rootDirectory, "../../dist");

if (usingSystemProxy) {
  app.log.info("Using the operating system proxy for external model requests.");
}

app.get("/health", async () => ({
  ok: true,
  service: "pi-graph-chat",
  version: APP_VERSION,
  databaseSchemaVersion: DATABASE_SCHEMA_VERSION,
}));

app.get("/api/diagnostics", async () => ({
  dataDirectory,
  agentDir: runtime.agentDir,
  piSessionDir,
  extensionErrors: runtime.extensionErrors,
  extensionsEnabled: process.env.PI_GRAPH_CHAT_PI_EXTENSIONS !== "0",
}));

app.get("/api/auth/openai-codex", async (_request, reply) => {
  reply.header("Cache-Control", "no-store");
  return codexAuth.getStatus();
});

app.get("/api/providers/ollama/models", async (_request, reply) => {
  try {
    const response = await fetch("http://127.0.0.1:11434/api/tags");
    if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
    const body = (await response.json()) as {
      models?: Array<{ name?: string; model?: string }>;
    };
    return {
      models: (body.models || [])
        .map((model) => model.name || model.model)
        .filter((model): model is string => Boolean(model)),
    };
  } catch {
    return reply.code(503).send({
      message: "Ollama is not available at http://127.0.0.1:11434.",
    });
  }
});

app.post("/api/auth/openai-codex", async (_request, reply) => {
  reply.header("Cache-Control", "no-store");
  return codexAuth.start();
});

app.delete("/api/auth/openai-codex", async (_request, reply) => {
  reply.header("Cache-Control", "no-store");
  return codexAuth.logout();
});

app.get("/api/bootstrap", async () => {
  const graphs = database.listGraphs();
  const archivedGraphs = database.listArchivedGraphs();
  const loaded = graphs[0] ? database.getGraph(graphs[0].id) : null;
  const activeGraph = loaded ? sessionSync.sync(loaded) : null;
  const settings = database.getSettings();
  return {
    graphs,
    archivedGraphs,
    activeGraph,
    settings: { ...settings, hasApiKey: runtime.hasApiKey(settings.provider) },
    piCwd: runtime.dataDirectory,
    piSessionDir,
  };
});

app.post("/api/graphs", async (request, reply) => {
  const parsed = createGraphSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply
      .code(400)
      .send({ message: "Invalid graph", issues: parsed.error.issues });
  }
  const project = resolveProjectDir(parsed.data.projectDir);
  if ("error" in project) return reply.code(400).send({ message: project.error });
  return reply.code(201).send(database.createGraph({ ...parsed.data, projectDir: project.projectDir }));
});

app.patch<{ Params: { id: string } }>(
  "/api/graphs/:id",
  async (request, reply) => {
    const parsed = updateGraphSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ message: "Invalid graph update", issues: parsed.error.issues });
    }
    const input = { ...parsed.data };
    if (input.projectDir !== undefined) {
      const project = resolveProjectDir(input.projectDir);
      if ("error" in project) return reply.code(400).send({ message: project.error });
      input.projectDir = project.projectDir;
    }
    const graph = database.updateGraph(request.params.id, input);
    if (!graph) return reply.code(404).send({ message: "Graph not found" });
    return graph;
  },
);

app.delete<{ Params: { id: string } }>(
  "/api/graphs/:id",
  async (request, reply) => {
    try {
      const graph = database.archiveGraph(request.params.id);
      if (!graph) return reply.code(404).send({ message: "Graph not found" });
      return graph;
    } catch (error) {
      if (error instanceof Error && error.message === "LAST_ACTIVE_GRAPH") {
        return reply
          .code(409)
          .send({ message: "Keep at least one active knowledge graph." });
      }
      throw error;
    }
  },
);

app.post<{ Params: { id: string } }>(
  "/api/graphs/:id/restore",
  async (request, reply) => {
    const graph = database.restoreGraph(request.params.id);
    if (!graph) {
      return reply.code(404).send({ message: "Archived graph not found" });
    }
    return graph;
  },
);

app.delete<{ Params: { id: string } }>(
  "/api/archived-graphs/:id",
  async (request, reply) => {
    const graph = database.deleteArchivedGraph(request.params.id);
    if (!graph) {
      return reply.code(404).send({ message: "Archived graph not found" });
    }
    removeGraphSessionFile(graph);
    return graph;
  },
);

app.delete("/api/archived-graphs", async () => {
  const archived = database.listArchivedGraphs();
  const deleted = database.deleteAllArchivedGraphs();
  for (const graph of archived) removeGraphSessionFile(graph);
  return { deleted };
});

app.get<{ Params: { id: string } }>("/api/graphs/:id", async (request, reply) => {
  const graph = database.getGraph(request.params.id);
  if (!graph) return reply.code(404).send({ message: "Graph not found" });
  return sessionSync.sync(graph);
});

app.get<{ Params: { id: string } }>("/api/graphs/:id/metrics", async (request, reply) => {
  if (!database.getGraph(request.params.id)) {
    return reply.code(404).send({ message: "Graph not found" });
  }
  return database.getMetrics(request.params.id);
});

app.post<{ Params: { id: string } }>("/api/graphs/:id/undo", async (request, reply) => {
  if (!database.getGraph(request.params.id)) {
    return reply.code(404).send({ message: "Graph not found" });
  }
  const graph = database.undoGraph(request.params.id);
  if (!graph) return reply.code(409).send({ message: "Nothing to undo" });
  return graph;
});

app.get<{ Params: { id: string } }>("/api/graphs/:id/study", async (request, reply) => {
  if (!database.getGraph(request.params.id)) {
    return reply.code(404).send({ message: "Graph not found" });
  }
  return database.getStudyCards(request.params.id);
});

app.get<{ Params: { id: string } }>("/api/graphs/:id/export.md", async (request, reply) => {
  const markdown = database.exportGraphMarkdown(request.params.id);
  if (markdown == null) return reply.code(404).send({ message: "Graph not found" });
  reply.header("Content-Type", "text/markdown; charset=utf-8");
  reply.header("Content-Disposition", `attachment; filename="pi-graph-chat-${request.params.id}.md"`);
  return markdown;
});

app.post("/api/import", async (request, reply) => {
  const parsed = importTextSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ message: "Invalid import", issues: parsed.error.issues });
  }
  try {
    return reply.code(201).send({ nodes: database.importText(parsed.data) });
  } catch (error) {
    if (error instanceof Error && error.message === "GRAPH_NOT_FOUND") {
      return reply.code(404).send({ message: "Graph not found" });
    }
    throw error;
  }
});

app.post("/api/restore", async (request, reply) => {
  const parsed = graphBackupSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ message: "Invalid Pi Graph Chat backup", issues: parsed.error.issues });
  }
  return reply.code(201).send({ graphs: database.restoreBackup(parsed.data) });
});

app.post("/api/nodes", async (request, reply) => {
  const parsed = createNodeSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ message: "Invalid node", issues: parsed.error.issues });
  return reply.code(201).send(database.createNode(parsed.data));
});

app.patch<{ Params: { id: string } }>("/api/nodes/:id", async (request, reply) => {
  const parsed = updateNodeSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ message: "Invalid update", issues: parsed.error.issues });
  const node = database.updateNode(request.params.id, parsed.data);
  if (!node) return reply.code(404).send({ message: "Node not found" });
  return node;
});

app.put<{ Params: { id: string } }>("/api/graphs/:id/layout", async (request, reply) => {
  const parsed = updateGraphLayoutSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply
      .code(400)
      .send({ message: "Invalid graph layout", issues: parsed.error.issues });
  }
  try {
    const nodes = database.updateGraphLayout(request.params.id, parsed.data);
    if (!nodes) return reply.code(404).send({ message: "Graph not found" });
    return { nodes };
  } catch (error) {
    if (error instanceof Error && error.message === "LAYOUT_NODE_MISMATCH") {
      return reply
        .code(400)
        .send({ message: "Layout contains a node outside this graph" });
    }
    throw error;
  }
});

app.get<{ Params: { id: string } }>("/api/nodes/:id", async (request, reply) => {
  const node = database.getNode(request.params.id);
  if (!node) return reply.code(404).send({ message: "Node not found" });
  return node;
});

app.get<{ Params: { id: string }; Querystring: { q?: string; limit?: string } }>(
  "/api/graphs/:id/search",
  async (request, reply) => {
    if (!database.getGraph(request.params.id)) {
      return reply.code(404).send({ message: "Graph not found" });
    }
    const limit = Math.min(20, Math.max(1, Number(request.query.limit) || 8));
    return { nodes: database.searchNodes(request.params.id, request.query.q ?? "", limit) };
  },
);

app.get<{ Querystring: { q?: string; limit?: string } }>("/api/search", async (request) => {
  const limit = Math.min(20, Math.max(1, Number(request.query.limit) || 8));
  const nodes = database.searchNodes(null, request.query.q ?? "", limit);
  const graphs = new Map(database.listGraphs().map((graph) => [graph.id, graph]));
  return {
    results: nodes.map((node) => ({
      node,
      graph: graphs.get(node.graphId) ?? null,
    })),
  };
});

app.get<{ Params: { sessionId: string } }>(
  "/api/graphs/by-session/:sessionId",
  async (request, reply) => {
    const graph = database.findGraphBySession(request.params.sessionId);
    if (!graph) return reply.code(404).send({ message: "No graph is backed by this session" });
    return graph;
  },
);

app.post<{ Params: { id: string } }>("/api/nodes/:id/suggest-metadata", async (request, reply) => {
  const suggestion = database.suggestMetadata(request.params.id);
  if (!suggestion) return reply.code(404).send({ message: "Node not found" });
  return suggestion;
});

app.delete<{ Params: { id: string } }>("/api/nodes/:id", async (request, reply) => {
  if (!database.deleteNode(request.params.id)) return reply.code(404).send({ message: "Node not found" });
  return reply.code(204).send();
});

app.post("/api/settings", async (request, reply) => {
  const body = request.body as Record<string, unknown>;
  const provider = body.provider as ProviderSettings["provider"];
  const parsed = providerSettingsSchema.safeParse({
    provider,
    model: body.model,
    baseUrl: body.baseUrl,
    hasApiKey: Boolean(body.apiKey) || runtime.hasApiKey(provider),
  });
  if (!parsed.success) return reply.code(400).send({ message: "Invalid settings", issues: parsed.error.issues });
  database.saveSettings(parsed.data);
  await runtime.configure(parsed.data, typeof body.apiKey === "string" ? body.apiKey : undefined);
  return { ...parsed.data, hasApiKey: runtime.hasApiKey(parsed.data.provider) };
});

app.get("/api/pi/sessions", async (_request, reply) => {
  reply.header("Cache-Control", "no-store");
  // Sessions the app created for its graphs are reached through the graph list.
  const graphSessions = new Set(database.listGraphSessionPaths().map((file) => path.resolve(file)));
  const sessions = piSessions
    .list()
    .filter((session) => !(isAppSessionId(session.id) && graphSessions.has(path.resolve(session.path))));
  return { sessionDir: piSessionDir, sessions };
});

app.get<{ Params: { id: string } }>("/api/pi/sessions/:id", async (request, reply) => {
  reply.header("Cache-Control", "no-store");
  const tree = piSessions.get(request.params.id);
  if (!tree) return reply.code(404).send({ message: "Pi session not found" });
  return tree;
});

app.get("/api/export", async (_request, reply) => {
  reply.header("Content-Disposition", `attachment; filename="pi-graph-chat-export.json"`);
  return database.exportAll();
});

app.post("/api/runs", async (request, reply) => {
  const parsed = runRequestSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ message: "Invalid run", issues: parsed.error.issues });

  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const controller = new AbortController();
  let activeNodeId: string | null = null;
  reply.raw.once("close", () => {
    if (!reply.raw.writableEnded) controller.abort();
  });
  try {
    for await (const event of runtime.run(database, parsed.data, controller.signal)) {
      if (event.type === "run_started") {
        activeNodeId = event.nodeId;
        activeRunControllers.set(event.nodeId, controller);
      }
      reply.raw.write(`${JSON.stringify(event)}\n`);
    }
  } finally {
    if (activeNodeId) activeRunControllers.delete(activeNodeId);
    sessionSync.invalidate(database.getGraph(parsed.data.graphId)?.graph.piSessionPath ?? null);
    reply.raw.end();
  }
});

app.delete<{ Params: { nodeId: string } }>("/api/runs/:nodeId", async (request, reply) => {
  const controller = activeRunControllers.get(request.params.nodeId);
  if (!controller) return reply.code(404).send({ message: "Run not found" });
  controller.abort();
  return reply.code(202).send({ cancelled: true });
});

if (
  process.env.PI_GRAPH_CHAT_CLIENT_DIR ||
  process.env.NODE_ENV === "production" ||
  process.argv[1]?.includes("dist-server")
) {
  await app.register(fastifyStatic, {
    root: productionClientDirectory,
    wildcard: false,
  });
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) return reply.code(404).send({ message: "Not found" });
    return reply.sendFile("index.html");
  });
}

const port = Number(process.env.PORT || 4317);
const host = process.env.HOST || "127.0.0.1";
await app.listen({ port, host });

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    codexAuth.dispose();
    await app.close();
  } finally {
    database.close();
  }
};
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
