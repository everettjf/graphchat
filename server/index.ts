import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import {
  createGraphSchema,
  createNodeSchema,
  providerSettingsSchema,
  runRequestSchema,
  type ProviderSettings,
  updateGraphSchema,
  updateNodeSchema,
} from "../shared/types.js";
import { GraphAgentRuntime } from "./agent-runtime.js";
import { FileCredentialStore } from "./credential-store.js";
import { GraphDatabase } from "./database.js";
import { OpenAICodexAuthManager } from "./openai-codex-auth.js";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

const app = Fastify({ logger: { level: process.env.NODE_ENV === "test" ? "silent" : "info" } });
const dataDirectory = path.resolve(process.env.GRAPHCHAT_DATA_DIR || ".graphchat");
const database = new GraphDatabase(dataDirectory);
const credentialStore = new FileCredentialStore(path.join(dataDirectory, "auth.json"));
const runtime = new GraphAgentRuntime(database.getSettings(), credentialStore);
const codexAuth = new OpenAICodexAuthManager(credentialStore);
const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const productionClientDirectory = process.env.GRAPHCHAT_CLIENT_DIR
  ? path.resolve(process.env.GRAPHCHAT_CLIENT_DIR)
  : path.resolve(rootDirectory, "../../dist");

app.get("/health", async () => ({ ok: true, service: "graphchat" }));

app.get("/api/auth/openai-codex", async (_request, reply) => {
  reply.header("Cache-Control", "no-store");
  return codexAuth.getStatus();
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
  const activeGraph = graphs[0] ? database.getGraph(graphs[0].id) : null;
  const settings = database.getSettings();
  return {
    graphs,
    archivedGraphs,
    activeGraph,
    settings: { ...settings, hasApiKey: runtime.hasApiKey(settings.provider) },
  };
});

app.post("/api/graphs", async (request, reply) => {
  const parsed = createGraphSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply
      .code(400)
      .send({ message: "Invalid graph", issues: parsed.error.issues });
  }
  return reply.code(201).send(database.createGraph(parsed.data));
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
    const graph = database.updateGraph(request.params.id, parsed.data);
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

app.get<{ Params: { id: string } }>("/api/graphs/:id", async (request, reply) => {
  const graph = database.getGraph(request.params.id);
  if (!graph) return reply.code(404).send({ message: "Graph not found" });
  return graph;
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
  runtime.configure(parsed.data, typeof body.apiKey === "string" ? body.apiKey : undefined);
  return { ...parsed.data, hasApiKey: runtime.hasApiKey(parsed.data.provider) };
});

app.get("/api/export", async (_request, reply) => {
  reply.header("Content-Disposition", `attachment; filename="graphchat-export.json"`);
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
  reply.raw.once("close", () => {
    if (!reply.raw.writableEnded) controller.abort();
  });
  try {
    for await (const event of runtime.run(database, parsed.data, controller.signal)) {
      reply.raw.write(`${JSON.stringify(event)}\n`);
    }
  } finally {
    reply.raw.end();
  }
});

if (
  process.env.GRAPHCHAT_CLIENT_DIR ||
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
