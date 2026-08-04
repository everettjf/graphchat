import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type {
  CreateGraphInput,
  CreateNodeInput,
  GraphDocument,
  GraphEdge,
  GraphBackup,
  GraphMeta,
  GraphMetrics,
  GraphNode,
  ImportTextInput,
  ProductValidationGraph,
  ProductValidationReport,
  ProviderSettings,
  StudyCard,
  UpdateGraphInput,
  UpdateNodeInput,
  UpdateGraphLayoutInput,
} from "../shared/types.js";
import { APP_VERSION } from "../shared/version.js";
import { migrateGraphDatabase } from "./database-migrations.js";

const now = () => new Date().toISOString();

export interface SQLiteStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
}

export interface SQLiteDatabase {
  close(): void;
  exec(sql: string): unknown;
  prepare(sql: string): SQLiteStatement;
}

type SQLiteConstructor = new (filename: string) => SQLiteDatabase;

const DatabaseConstructor: SQLiteConstructor = await (async () => {
  if (process.versions.bun) {
    const { Database } = await import("bun:sqlite");
    return Database as unknown as SQLiteConstructor;
  }

  const { DatabaseSync } = await import("node:sqlite");
  return DatabaseSync as unknown as SQLiteConstructor;
})();

function bool(value: unknown): boolean {
  return Number(value) === 1;
}

export class GraphDatabase {
  private readonly db: SQLiteDatabase;
  private historyEnabled = false;

  constructor(dataDirectory = process.env.GRAPHCHAT_DATA_DIR || ".graphchat") {
    const absoluteDirectory = path.resolve(dataDirectory);
    fs.mkdirSync(absoluteDirectory, { recursive: true });
    this.db = new DatabaseConstructor(path.join(absoluteDirectory, "graphchat.sqlite"));
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    migrateGraphDatabase(this.db);
    this.recoverInterruptedRuns();
    this.seed();
    this.historyEnabled = true;
  }

  private transaction<T>(operation: () => T): T {
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      const result = operation();
      this.db.exec("COMMIT;");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  private seed() {
    const count = this.db.prepare("SELECT COUNT(*) AS count FROM graphs").get() as { count: number };
    if (Number(count.count) > 0) return;

    const timestamp = now();
    const graph: GraphMeta = {
      id: "learning-rag",
      title: "Understanding RAG: from new concepts to a complete picture",
      description: "An example graph showing branches, follow-ups, and synthesis",
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    };
    this.db
      .prepare(
        "INSERT INTO graphs (id, title, description, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        graph.id,
        graph.title,
        graph.description,
        graph.createdAt,
        graph.updatedAt,
        graph.archivedAt,
      );

    const assetDefaults = {
      tags: [] as string[],
      knowledgeStatus: "exploring" as const,
      mastery: "new" as const,
      sourceUrl: "",
      credibility: null,
      rating: 0,
      contextSnapshot: null,
    };
    const nodes: GraphNode[] = [
      {
        ...assetDefaults,
        id: "root-rag",
        graphId: graph.id,
        kind: "answer",
        title: "What is RAG?",
        prompt: "Explain RAG in plain language and why it is useful.",
        content:
          "RAG (retrieval-augmented generation) retrieves relevant material from your sources before a model answers, then generates the answer from that material.\n\nA typical pipeline has three steps: turn the source material into **embeddings** and store them; find relevant passages in a **vector database**; send those passages and the question to the model. This adds private or current information the model may not know and makes answers easier to trace.",
        summary:
          "RAG improves model answers with retrieved sources through embeddings, vector search, and generation.",
        selectedText: null,
        x: 40,
        y: 220,
        status: "complete",
        provider: "demo",
        model: "graphchat-guide",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        ...assetDefaults,
        id: "embedding",
        graphId: graph.id,
        kind: "concept",
        title: "What exactly is an embedding?",
        prompt: "What does embedding mean here? Explain it with an analogy.",
        content:
          "An embedding is like assigning a set of “semantic coordinates” to a piece of text. Texts with similar meanings end up near one another in this high-dimensional space.\n\nFor example, “how should I water a plant?” and “how often does a houseplant need water?” use different words but express similar ideas, so their vectors are usually close.",
        summary:
          "An embedding gives text semantic coordinates so similar meanings stay close in vector space.",
        selectedText: "turn the source material into embeddings and store them",
        x: 410,
        y: 40,
        status: "complete",
        provider: "demo",
        model: "graphchat-guide",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        ...assetDefaults,
        id: "vector-space",
        graphId: graph.id,
        kind: "answer",
        title: "Why is it called high-dimensional space?",
        prompt: "Is this a physical space? What do its dimensions represent?",
        content:
          "It is not physical space, but a mathematical coordinate system. The model learns each dimension, and one dimension usually cannot be labeled as a single human concept such as “mood” or “topic.” The coordinates work together to represent meaning.\n\nIn practice, the distance between vectors matters more than interpreting one dimension at a time.",
        summary:
          "High-dimensional space is a mathematical representation; vector distance matters more than individual dimensions.",
        selectedText: "high-dimensional space",
        x: 790,
        y: 20,
        status: "complete",
        provider: "demo",
        model: "graphchat-guide",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        ...assetDefaults,
        id: "vector-db",
        graphId: graph.id,
        kind: "concept",
        title: "What does a vector database do?",
        prompt: "How is a vector database different from a regular database?",
        content:
          "Regular databases excel at exact matches, such as looking up an order number. Vector databases excel at similarity search, such as finding the source passages whose meanings are closest to a question.\n\nThey store vectors together with original text and source metadata, then use approximate nearest-neighbor indexes to find similar items quickly.",
        summary:
          "A vector database stores semantic vectors and efficiently finds source passages similar to a question.",
        selectedText: "vector database",
        x: 410,
        y: 360,
        status: "complete",
        provider: "demo",
        model: "graphchat-guide",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        ...assetDefaults,
        id: "similarity",
        graphId: graph.id,
        kind: "answer",
        title: "How is similarity calculated?",
        prompt: "How does the system decide whether two vectors are similar?",
        content:
          "Common methods include cosine similarity, dot product, and Euclidean distance. Cosine similarity compares vector direction and is less sensitive to changes in magnitude. The right choice depends on how the embedding model was trained and configured.",
        summary:
          "Vector similarity is commonly measured with cosine similarity, dot product, or Euclidean distance.",
        selectedText: "similarity search",
        x: 790,
        y: 400,
        status: "complete",
        provider: "demo",
        model: "graphchat-guide",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        ...assetDefaults,
        id: "synthesis",
        graphId: graph.id,
        kind: "summary",
        title: "How do embeddings and vector databases work together?",
        prompt: "Combine both branches and explain their roles in RAG.",
        content:
          "The embedding model translates questions and source material into the same kind of semantic coordinates. The vector database stores those coordinates and quickly finds nearby material.\n\nThink of embeddings as the map-making rules and the vector database as a map with fast navigation. RAG then sends the original passages found by that navigation to the generation model.",
        summary:
          "Embeddings create semantic coordinates; vector databases store and retrieve them to power RAG's retrieval stage.",
        selectedText: null,
        x: 1160,
        y: 215,
        status: "complete",
        provider: "demo",
        model: "graphchat-guide",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ];

    const insertNode = this.db.prepare(`
      INSERT INTO nodes (
        id, graph_id, kind, title, prompt, content, summary, tags,
        knowledge_status, mastery, source_url, credibility, rating, context_snapshot,
        selected_text, x, y, status, provider, model, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const node of nodes) {
      insertNode.run(
        node.id,
        node.graphId,
        node.kind,
        node.title,
        node.prompt,
        node.content,
        node.summary,
        JSON.stringify(node.tags),
        node.knowledgeStatus,
        node.mastery,
        node.sourceUrl,
        node.credibility,
        node.rating,
        node.contextSnapshot == null ? null : JSON.stringify(node.contextSnapshot),
        node.selectedText,
        node.x,
        node.y,
        node.status,
        node.provider,
        node.model,
        node.createdAt,
        node.updatedAt,
      );
    }

    const edges: Array<Omit<GraphEdge, "id" | "createdAt">> = [
      { graphId: graph.id, source: "root-rag", target: "embedding", kind: "branch", label: "Explain term", includeInContext: true },
      { graphId: graph.id, source: "embedding", target: "vector-space", kind: "branch", label: "Follow-up", includeInContext: true },
      { graphId: graph.id, source: "root-rag", target: "vector-db", kind: "branch", label: "Explain term", includeInContext: true },
      { graphId: graph.id, source: "vector-db", target: "similarity", kind: "branch", label: "Follow-up", includeInContext: true },
      { graphId: graph.id, source: "embedding", target: "synthesis", kind: "reference", label: "Synthesis", includeInContext: true },
      { graphId: graph.id, source: "vector-db", target: "synthesis", kind: "reference", label: "Synthesis", includeInContext: true },
    ];
    const insertEdge = this.db.prepare(
      "INSERT INTO edges VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const edge of edges) {
      insertEdge.run(
        nanoid(),
        edge.graphId,
        edge.source,
        edge.target,
        edge.kind,
        edge.label,
        edge.includeInContext ? 1 : 0,
        timestamp,
      );
    }
  }

  listGraphs(): GraphMeta[] {
    return (
      this.db
        .prepare(
          "SELECT * FROM graphs WHERE archived_at IS NULL ORDER BY updated_at DESC",
        )
        .all() as Record<string, unknown>[]
    ).map(this.mapGraph);
  }

  listArchivedGraphs(): GraphMeta[] {
    return (
      this.db
        .prepare(
          "SELECT * FROM graphs WHERE archived_at IS NOT NULL ORDER BY archived_at DESC",
        )
        .all() as Record<string, unknown>[]
    ).map(this.mapGraph);
  }

  getGraph(id: string): GraphDocument | null {
    const graphRow = this.db.prepare("SELECT * FROM graphs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!graphRow) return null;
    const graph = this.mapGraph(graphRow);
    const nodes = (this.db.prepare("SELECT * FROM nodes WHERE graph_id = ? ORDER BY created_at").all(id) as Record<string, unknown>[]).map(
      this.mapNode,
    );
    const edges = (this.db.prepare("SELECT * FROM edges WHERE graph_id = ? ORDER BY created_at").all(id) as Record<string, unknown>[]).map(
      this.mapEdge,
    );
    return { graph, nodes, edges };
  }

  createGraph(input: CreateGraphInput): GraphDocument {
    const timestamp = now();
    const graph: GraphMeta = {
      id: nanoid(),
      title: input.title,
      description: input.description,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    };
    this.db
      .prepare(
        "INSERT INTO graphs (id, title, description, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, ?, NULL)",
      )
      .run(
        graph.id,
        graph.title,
        graph.description,
        graph.createdAt,
        graph.updatedAt,
      );
    return { graph, nodes: [], edges: [] };
  }

  updateGraph(id: string, input: UpdateGraphInput): GraphMeta | null {
    const existing = this.db
      .prepare("SELECT * FROM graphs WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    if (!existing) return null;
    const graph = this.mapGraph(existing);
    const updatedAt = now();
    this.db
      .prepare(
        "UPDATE graphs SET title = ?, description = ?, updated_at = ? WHERE id = ?",
      )
      .run(
        input.title ?? graph.title,
        input.description ?? graph.description,
        updatedAt,
        id,
      );
    return this.mapGraph(
      this.db.prepare("SELECT * FROM graphs WHERE id = ?").get(id) as Record<
        string,
        unknown
      >,
    );
  }

  archiveGraph(id: string): GraphMeta | null {
    const existing = this.db
      .prepare("SELECT * FROM graphs WHERE id = ? AND archived_at IS NULL")
      .get(id) as Record<string, unknown> | undefined;
    if (!existing) return null;
    const activeCount = this.db
      .prepare(
        "SELECT COUNT(*) AS count FROM graphs WHERE archived_at IS NULL",
      )
      .get() as { count: number };
    if (Number(activeCount.count) <= 1) {
      throw new Error("LAST_ACTIVE_GRAPH");
    }
    const timestamp = now();
    this.db
      .prepare(
        "UPDATE graphs SET archived_at = ?, updated_at = ? WHERE id = ?",
      )
      .run(timestamp, timestamp, id);
    return this.mapGraph({
      ...existing,
      archived_at: timestamp,
      updated_at: timestamp,
    });
  }

  restoreGraph(id: string): GraphMeta | null {
    const existing = this.db
      .prepare("SELECT * FROM graphs WHERE id = ? AND archived_at IS NOT NULL")
      .get(id) as Record<string, unknown> | undefined;
    if (!existing) return null;
    const timestamp = now();
    this.db
      .prepare(
        "UPDATE graphs SET archived_at = NULL, updated_at = ? WHERE id = ?",
      )
      .run(timestamp, id);
    return this.mapGraph({
      ...existing,
      archived_at: null,
      updated_at: timestamp,
    });
  }

  deleteArchivedGraph(id: string): GraphMeta | null {
    const existing = this.db
      .prepare("SELECT * FROM graphs WHERE id = ? AND archived_at IS NOT NULL")
      .get(id) as Record<string, unknown> | undefined;
    if (!existing) return null;
    this.db
      .prepare("DELETE FROM graphs WHERE id = ? AND archived_at IS NOT NULL")
      .run(id);
    return this.mapGraph(existing);
  }

  deleteAllArchivedGraphs(): number {
    const result = this.db
      .prepare(
        "SELECT COUNT(*) AS count FROM graphs WHERE archived_at IS NOT NULL",
      )
      .get() as { count: number };
    const count = Number(result.count);
    if (count > 0) {
      this.db.prepare("DELETE FROM graphs WHERE archived_at IS NOT NULL").run();
    }
    return count;
  }

  getNode(id: string): GraphNode | null {
    const row = this.db.prepare("SELECT * FROM nodes WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? this.mapNode(row) : null;
  }

  createNode(input: CreateNodeInput, provider: string | null = null, model: string | null = null): GraphNode {
    this.recordRevision(input.graphId, "create-node");
    const timestamp = now();
    const node: GraphNode = {
      id: nanoid(),
      graphId: input.graphId,
      kind: input.kind ?? "question",
      title: input.title,
      prompt: input.prompt ?? "",
      content: input.content ?? "",
      summary: input.summary ?? "",
      tags: input.tags ?? [],
      knowledgeStatus: input.knowledgeStatus ?? "exploring",
      mastery: input.mastery ?? "new",
      sourceUrl: input.sourceUrl ?? "",
      credibility: input.credibility ?? null,
      rating: input.rating ?? 0,
      contextSnapshot: input.contextSnapshot ?? null,
      selectedText: input.selectedText ?? null,
      x: input.x,
      y: input.y,
      status: input.content ? "complete" : "idle",
      provider,
      model,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.db
      .prepare(`
        INSERT INTO nodes (
          id, graph_id, kind, title, prompt, content, summary, tags,
          knowledge_status, mastery, source_url, credibility, rating, context_snapshot,
          selected_text, x, y, status, provider, model, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        node.id,
        node.graphId,
        node.kind,
        node.title,
        node.prompt,
        node.content,
        node.summary,
        JSON.stringify(node.tags),
        node.knowledgeStatus,
        node.mastery,
        node.sourceUrl,
        node.credibility,
        node.rating,
        node.contextSnapshot == null ? null : JSON.stringify(node.contextSnapshot),
        node.selectedText,
        node.x,
        node.y,
        node.status,
        node.provider,
        node.model,
        node.createdAt,
        node.updatedAt,
      );
    if (input.parentNodeId) this.createEdge(input.graphId, input.parentNodeId, node.id, "branch", "继续追问");
    if (input.parentNodeId && input.parentEdgeKind === "continuation") {
      this.db
        .prepare(
          "UPDATE edges SET kind = 'continuation', label = 'Continue' WHERE graph_id = ? AND source = ? AND target = ?",
        )
        .run(input.graphId, input.parentNodeId, node.id);
    }
    for (const referenceNodeId of input.referenceNodeIds ?? []) {
      if (referenceNodeId !== input.parentNodeId) {
        this.createEdge(input.graphId, referenceNodeId, node.id, "reference", "引用");
      }
    }
    if (input.parentNodeId) {
      this.recordEvent(
        input.graphId,
        input.parentEdgeKind === "continuation"
          ? "continuation-created"
          : "branch-created",
        { nodeId: node.id },
      );
    }
    if ((input.referenceNodeIds?.length || 0) >= 2 || node.kind === "summary") {
      this.recordEvent(input.graphId, "synthesis-created", { nodeId: node.id });
    }
    this.touchGraph(input.graphId);
    return node;
  }

  updateNode(id: string, input: UpdateNodeInput & { provider?: string | null; model?: string | null }): GraphNode | null {
    const existing = this.getNode(id);
    if (!existing) return null;
    this.recordRevision(existing.graphId, "update-node");
    const next = { ...existing, ...input, updatedAt: now() };
    this.db
      .prepare(`
        UPDATE nodes SET title=?, prompt=?, content=?, summary=?, tags=?,
          knowledge_status=?, mastery=?, source_url=?, credibility=?, rating=?,
          x=?, y=?, status=?, provider=?, model=?, updated_at=? WHERE id=?
      `)
      .run(
        next.title,
        next.prompt,
        next.content,
        next.summary,
        JSON.stringify(next.tags),
        next.knowledgeStatus,
        next.mastery,
        next.sourceUrl,
        next.credibility,
        next.rating,
        next.x,
        next.y,
        next.status,
        next.provider,
        next.model,
        next.updatedAt,
        id,
      );
    if (
      existing.knowledgeStatus !== next.knowledgeStatus &&
      next.knowledgeStatus === "conclusion"
    ) {
      this.recordEvent(existing.graphId, "conclusion-created", { nodeId: id });
    }
    if (existing.mastery !== next.mastery) {
      this.recordEvent(existing.graphId, "mastery-changed", {
        nodeId: id,
        from: existing.mastery,
        to: next.mastery,
      });
    }
    if (existing.rating !== next.rating && next.rating !== 0) {
      this.recordEvent(existing.graphId, "feedback-recorded", {
        nodeId: id,
        rating: next.rating,
      });
    }
    this.touchGraph(existing.graphId);
    return next;
  }

  updateGraphLayout(
    graphId: string,
    input: UpdateGraphLayoutInput,
  ): GraphNode[] | null {
    if (!this.getGraph(graphId)) return null;
    const uniquePositions = new Map(
      input.positions.map((position) => [position.id, position]),
    );
    const existingNodes = [...uniquePositions.keys()].map((id) => this.getNode(id));
    if (
      existingNodes.some(
        (node) => !node || node.graphId !== graphId,
      )
    ) {
      throw new Error("LAYOUT_NODE_MISMATCH");
    }

    const timestamp = now();
    const update = this.db.prepare(
      "UPDATE nodes SET x = ?, y = ?, updated_at = ? WHERE id = ? AND graph_id = ?",
    );
    this.transaction(() => {
      this.recordRevision(graphId, "update-layout");
      for (const position of uniquePositions.values()) {
        update.run(position.x, position.y, timestamp, position.id, graphId);
      }
      this.touchGraph(graphId);
    });

    return [...uniquePositions.keys()]
      .map((id) => this.getNode(id))
      .filter((node): node is GraphNode => Boolean(node));
  }

  deleteNode(id: string): boolean {
    const existing = this.getNode(id);
    if (!existing) return false;
    this.recordRevision(existing.graphId, "delete-node");
    this.db.prepare("DELETE FROM nodes WHERE id = ?").run(id);
    this.touchGraph(existing.graphId);
    return true;
  }

  searchNodes(graphId: string, query: string, limit = 6): GraphNode[] {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return [];
    const queryTokens = new Set(
      normalized.match(/[\p{L}\p{N}-]{2,}/gu) || [normalized],
    );
    const hasCjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(
      normalized,
    );
    const ftsQuery = [...queryTokens]
      .map((token) => `"${token.replaceAll('"', '""')}"*`)
      .join(" OR ");
    const rows = (
      hasCjk
        ? this.db
            .prepare(
              `SELECT * FROM nodes
               WHERE graph_id = ?
                 AND lower(title || ' ' || prompt || ' ' || summary || ' ' ||
                   content || ' ' || tags || ' ' || source_url) LIKE ?
               LIMIT ?`,
            )
            .all(graphId, `%${normalized}%`, Math.max(limit * 8, 48))
        : this.db
            .prepare(
              `SELECT nodes.*
               FROM nodes_fts
               JOIN nodes ON nodes.rowid = nodes_fts.rowid
               WHERE nodes_fts MATCH ? AND nodes.graph_id = ?
               ORDER BY bm25(nodes_fts, 0, 0, 8, 3, 5, 1, 4, 1)
               LIMIT ?`,
            )
            .all(ftsQuery, graphId, Math.max(limit * 8, 48))
    ) as Record<string, unknown>[];
    return rows
      .map(this.mapNode)
      .map((node) => {
        const title = node.title.toLocaleLowerCase();
        const prompt = node.prompt.toLocaleLowerCase();
        const summary = node.summary.toLocaleLowerCase();
        const content = node.content.toLocaleLowerCase();
        const tags = node.tags.join(" ").toLocaleLowerCase();
        const source = node.sourceUrl.toLocaleLowerCase();
        const documentTokens = new Set(
          `${title} ${prompt} ${summary} ${content} ${tags}`
            .match(/[\p{L}\p{N}-]{2,}/gu) || [],
        );
        const overlap = [...queryTokens].filter((token) => documentTokens.has(token)).length;
        const tokenScore = queryTokens.size ? (overlap / queryTokens.size) * 30 : 0;
        const fieldScore =
          title === normalized ? 100 :
          title.includes(normalized) ? 60 :
          tags.includes(normalized) ? 50 :
          summary.includes(normalized) ? 35 :
          prompt.includes(normalized) ? 25 :
          content.includes(normalized) || source.includes(normalized) ? 10 : 0;
        return { node, score: fieldScore + tokenScore + node.rating * 2 };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || b.node.updatedAt.localeCompare(a.node.updatedAt))
      .slice(0, limit)
      .map(({ node }) => node);
  }

  createEdge(
    graphId: string,
    source: string,
    target: string,
    kind: GraphEdge["kind"],
    label = "",
    includeInContext = true,
  ): GraphEdge {
    const edge: GraphEdge = {
      id: nanoid(),
      graphId,
      source,
      target,
      kind,
      label,
      includeInContext,
      createdAt: now(),
    };
    this.db
      .prepare("INSERT INTO edges VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(edge.id, graphId, source, target, kind, label, includeInContext ? 1 : 0, edge.createdAt);
    this.touchGraph(graphId);
    return edge;
  }

  getSettings(): ProviderSettings {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = 'provider'").get() as { value: string } | undefined;
    const fallback: ProviderSettings =
      process.env.NODE_ENV === "test"
        ? {
            provider: "demo",
            model: "graphchat-guide",
            baseUrl: "",
            hasApiKey: false,
          }
        : {
            provider: "ollama",
            model: "qwen3.5:4b",
            baseUrl: "http://127.0.0.1:11434/v1",
            hasApiKey: false,
          };
    if (!row) return fallback;
    const settings = JSON.parse(row.value) as ProviderSettings;
    return settings.provider === "demo"
      ? fallback
      : { ...settings, hasApiKey: false };
  }

  saveSettings(settings: ProviderSettings) {
    this.db
      .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('provider', ?)")
      .run(JSON.stringify({ ...settings, hasApiKey: false }));
  }

  recoverInterruptedRuns(): number {
    const interrupted = this.db
      .prepare("SELECT id, graph_id, content FROM nodes WHERE status = 'streaming'")
      .all() as Array<{ id: string; graph_id: string; content: string }>;
    if (interrupted.length === 0) return 0;

    const timestamp = now();
    const update = this.db.prepare(
      "UPDATE nodes SET status = 'error', content = ?, updated_at = ? WHERE id = ?",
    );
    for (const node of interrupted) {
      update.run(
        node.content || "Generation was interrupted before it could finish. You can retry from this node.",
        timestamp,
        node.id,
      );
    }
    const graphIds = [...new Set(interrupted.map((node) => node.graph_id))];
    const touch = this.db.prepare("UPDATE graphs SET updated_at = ? WHERE id = ?");
    for (const graphId of graphIds) touch.run(timestamp, graphId);
    return interrupted.length;
  }

  exportAll(): GraphBackup & { exportedAt: string } {
    return {
      version: 2,
      exportedAt: now(),
      graphs: [...this.listGraphs(), ...this.listArchivedGraphs()]
        .map((graph) => this.getGraph(graph.id))
        .filter((graph): graph is GraphDocument => graph !== null),
    };
  }

  importText(input: ImportTextInput): GraphNode[] {
    const graph = this.getGraph(input.graphId);
    if (!graph) throw new Error("GRAPH_NOT_FOUND");
    const sections = input.format === "markdown"
      ? input.content.split(/(?=^#{1,3}\s+)/m)
      : input.content.split(/\n\s*\n/);
    const chunks = sections.map((section) => section.trim()).filter(Boolean);
    const created: GraphNode[] = [];
    let parentNodeId: string | null = null;
    for (const [index, chunk] of chunks.slice(0, 200).entries()) {
      const lines = chunk.split("\n");
      const heading = lines[0]?.match(/^#{1,3}\s+(.+)/)?.[1]?.trim();
      const content = heading ? lines.slice(1).join("\n").trim() : chunk;
      const node = this.createNode({
        graphId: input.graphId,
        parentNodeId,
        referenceNodeIds: [],
        kind: "note",
        title: heading || (index === 0 ? input.title : `${input.title} · ${index + 1}`),
        prompt: "",
        content,
        summary: content.slice(0, 240),
        tags: ["imported"],
        knowledgeStatus: "exploring",
        mastery: "new",
        sourceUrl: input.sourceUrl,
        credibility: null,
        rating: 0,
        selectedText: null,
        x: 40 + index * 340,
        y: 700 + (index % 2) * 180,
      });
      created.push(node);
      parentNodeId = node.id;
    }
    this.recordEvent(input.graphId, "source-imported", {
      count: created.length,
      format: input.format,
    });
    return created;
  }

  restoreBackup(backup: GraphBackup): GraphDocument[] {
    const restored: GraphDocument[] = [];
    for (const source of backup.graphs) {
      const created = this.createGraph({
        title: `${source.graph.title} (restored)`,
        description: source.graph.description,
      });
      const nodeIds = new Map<string, string>();
      for (const node of source.nodes) {
        const restoredNode = this.createNode({
          graphId: created.graph.id,
          parentNodeId: null,
          referenceNodeIds: [],
          kind: node.kind,
          title: node.title,
          prompt: node.prompt,
          content: node.content,
          summary: node.summary,
          tags: node.tags,
          knowledgeStatus: node.knowledgeStatus,
          mastery: node.mastery,
          sourceUrl: node.sourceUrl,
          credibility: node.credibility,
          rating: node.rating,
          contextSnapshot: node.contextSnapshot,
          selectedText: node.selectedText,
          x: node.x,
          y: node.y,
        }, node.provider, node.model);
        this.updateNode(restoredNode.id, { status: node.status });
        nodeIds.set(node.id, restoredNode.id);
      }
      for (const edge of source.edges) {
        const sourceId = nodeIds.get(edge.source);
        const targetId = nodeIds.get(edge.target);
        if (sourceId && targetId) {
          this.createEdge(
            created.graph.id,
            sourceId,
            targetId,
            edge.kind,
            edge.label,
            edge.includeInContext,
          );
        }
      }
      restored.push(this.getGraph(created.graph.id)!);
    }
    return restored;
  }

  suggestMetadata(nodeId: string) {
    const node = this.getNode(nodeId);
    if (!node) return null;
    const stopwords = new Set([
      "about", "after", "also", "because", "been", "being", "from", "have",
      "into", "more", "that", "their", "then", "there", "these", "they",
      "this", "through", "using", "what", "when", "where", "which", "with",
      "一个", "这个", "可以", "以及", "通过", "进行", "用于", "需要", "解释",
    ]);
    const words = `${node.title} ${node.summary} ${node.content}`
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}-]{3,}/gu) || [];
    const counts = new Map<string, number>();
    for (const word of words) {
      if (stopwords.has(word) || /^\d+$/.test(word)) continue;
      counts.set(word, (counts.get(word) || 0) + 1);
    }
    const tags = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([word]) => word);
    return {
      tags: [...new Set([...node.tags, ...tags])].slice(0, 8),
      summary: node.summary || node.content.replace(/\s+/g, " ").trim().slice(0, 240),
      knowledgeStatus: node.kind === "summary" ? "conclusion" as const : node.knowledgeStatus,
    };
  }

  getStudyCards(graphId: string, limit = 20): StudyCard[] {
    const graph = this.getGraph(graphId);
    if (!graph) return [];
    const rank = { new: 0, learning: 1, mastered: 2 };
    return graph.nodes
      .filter((node) => node.status === "complete" && Boolean(node.summary || node.content))
      .sort((a, b) => rank[a.mastery] - rank[b.mastery] || b.updatedAt.localeCompare(a.updatedAt))
      .flatMap((node): StudyCard[] => {
        const answer = node.summary || node.content;
        return [
          {
            nodeId: node.id,
            kind: "recall",
            question: node.prompt || `Explain: ${node.title}`,
            answer,
            mastery: node.mastery,
            sourceUrl: node.sourceUrl,
          },
          {
            nodeId: node.id,
            kind: "concept",
            question: `Which concept does this describe?\n${answer.slice(0, 180)}`,
            answer: node.title,
            mastery: node.mastery,
            sourceUrl: node.sourceUrl,
          },
          {
            nodeId: node.id,
            kind: "counterexample",
            question: `State a counterexample, failure mode, or boundary case for: ${node.title}`,
            answer: `Compare your answer with the source explanation:\n${answer}`,
            mastery: node.mastery,
            sourceUrl: node.sourceUrl,
          },
        ];
      })
      .slice(0, limit);
  }

  getMetrics(graphId: string): GraphMetrics {
    const graph = this.getGraph(graphId);
    if (!graph) {
      return {
        nodes: 0, edges: 0, branches: 0, references: 0, conclusions: 0,
        verified: 0, mastered: 0, reusableConclusions: 0, firstBranchAt: null,
        firstSynthesisAt: null, lastOpenedAt: null, activityLast7Days: 0,
        evidenceCoverage: 0, ratedAnswers: 0, helpfulRate: null,
      };
    }
    const incoming = new Map<string, number>();
    for (const edge of graph.edges) incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
    const eventSummary = this.db
      .prepare(`
        SELECT
          MIN(CASE WHEN type = 'branch-created' THEN created_at END) AS first_branch_at,
          MIN(CASE WHEN type = 'synthesis-created' THEN created_at END) AS first_synthesis_at,
          MAX(CASE WHEN type = 'graph-opened' THEN created_at END) AS last_opened_at,
          SUM(CASE WHEN julianday(created_at) >= julianday('now', '-7 days') THEN 1 ELSE 0 END) AS activity_7d
        FROM graph_events WHERE graph_id = ?
      `)
      .get(graphId) as Record<string, unknown>;
    return {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      branches: graph.edges.filter((edge) => edge.kind === "branch").length,
      references: graph.edges.filter((edge) => edge.kind === "reference").length,
      conclusions: graph.nodes.filter((node) => node.knowledgeStatus === "conclusion").length,
      verified: graph.nodes.filter((node) => node.knowledgeStatus === "verified").length,
      mastered: graph.nodes.filter((node) => node.mastery === "mastered").length,
      reusableConclusions: graph.nodes.filter((node) =>
        node.knowledgeStatus === "conclusion" &&
        (incoming.get(node.id) || 0) >= 2 &&
        Boolean(node.summary),
      ).length,
      firstBranchAt: eventSummary.first_branch_at == null ? null : String(eventSummary.first_branch_at),
      firstSynthesisAt: eventSummary.first_synthesis_at == null ? null : String(eventSummary.first_synthesis_at),
      lastOpenedAt: eventSummary.last_opened_at == null ? null : String(eventSummary.last_opened_at),
      activityLast7Days: Number(eventSummary.activity_7d || 0),
      evidenceCoverage:
        graph.nodes.filter((node) => node.knowledgeStatus === "conclusion").length === 0
          ? 0
          : graph.nodes.filter((node) =>
              node.knowledgeStatus === "conclusion" &&
              (incoming.get(node.id) || 0) >= 2 &&
              Boolean(node.summary),
            ).length /
            graph.nodes.filter((node) => node.knowledgeStatus === "conclusion").length,
      ratedAnswers: graph.nodes.filter((node) => node.rating !== 0).length,
      helpfulRate: graph.nodes.some((node) => node.rating !== 0)
        ? graph.nodes.filter((node) => node.rating > 0).length /
          graph.nodes.filter((node) => node.rating !== 0).length
        : null,
    };
  }

  recordEvent(
    graphId: string,
    type: string,
    metadata: Record<string, unknown> = {},
    createdAt = now(),
  ) {
    if (!this.getGraph(graphId)) return false;
    this.db
      .prepare(
        "INSERT INTO graph_events (id, graph_id, type, metadata, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(nanoid(), graphId, type, JSON.stringify(metadata), createdAt);
    return true;
  }

  getProductValidationReport(): ProductValidationReport {
    const graphRows = this.db
      .prepare("SELECT id FROM graphs ORDER BY created_at")
      .all() as Array<{ id: string }>;
    const graphs = graphRows
      .map(({ id }) => this.getGraph(id))
      .filter((graph): graph is GraphDocument => graph !== null)
      .map((graph): ProductValidationGraph => {
        const eventRows = this.db
          .prepare(
            "SELECT id, type, metadata, created_at FROM graph_events WHERE graph_id = ? ORDER BY created_at, rowid",
          )
          .all(graph.graph.id) as Array<{
            id: string;
            type: string;
            metadata: string;
            created_at: string;
          }>;
        const events = eventRows.map((event) => {
          let metadata: Record<string, unknown> = {};
          try {
            metadata = JSON.parse(event.metadata) as Record<string, unknown>;
          } catch {
            // Invalid legacy metadata is ignored, while the event remains countable.
          }
          return { ...event, metadata };
        });
        const firstAt = (type: string) =>
          events.find((event) => event.type === type)?.created_at ?? null;
        const firstOpenedAt = firstAt("graph-opened");
        const firstBranchAt = firstAt("branch-created");
        const firstSynthesisAt = firstAt("synthesis-created");
        const elapsedMinutes = (timestamp: string | null) => {
          if (!timestamp) return null;
          const origin = new Date(firstOpenedAt || graph.graph.createdAt).getTime();
          return Math.max(0, Math.round(((new Date(timestamp).getTime() - origin) / 60_000) * 10) / 10);
        };
        const incoming = new Map<string, Set<string>>();
        for (const edge of graph.edges) {
          const sources = incoming.get(edge.target) || new Set<string>();
          sources.add(edge.source);
          incoming.set(edge.target, sources);
        }
        const conclusions = graph.nodes.filter(
          (node) => node.knowledgeStatus === "conclusion",
        );
        const evidenceBacked = conclusions.filter(
          (node) => (incoming.get(node.id)?.size || 0) >= 2 && Boolean(node.summary),
        );
        const activationAt =
          firstSynthesisAt && evidenceBacked.length > 0
            ? [
                firstSynthesisAt,
                ...evidenceBacked.map((node) => node.updatedAt),
              ].sort().at(-1) || null
            : null;
        const openEvents = events.filter((event) => event.type === "graph-opened");
        const sessions = new Set(
          openEvents.map((event) =>
            typeof event.metadata.sessionId === "string"
              ? event.metadata.sessionId
              : `legacy-${event.id}`,
          ),
        );
        const firstOpenMs = firstOpenedAt ? new Date(firstOpenedAt).getTime() : null;
        const returnedAfter7Days =
          firstOpenMs !== null &&
          openEvents.some(
            (event) => new Date(event.created_at).getTime() - firstOpenMs >= 7 * 86_400_000,
          );
        const rated = graph.nodes.filter((node) => node.rating !== 0);
        const countEvent = (type: string) =>
          events.filter((event) => event.type === type).length;
        return {
          graphId: graph.graph.id,
          createdAt: graph.graph.createdAt,
          eligible: events.some((event) =>
            ["source-imported", "branch-created"].includes(event.type),
          ),
          activated: activationAt !== null,
          activationAt,
          timeToFirstBranchMinutes: elapsedMinutes(firstBranchAt),
          timeToFirstSynthesisMinutes: elapsedMinutes(firstSynthesisAt),
          distinctSessions: sessions.size,
          returnedAfter7Days,
          conclusions: conclusions.length,
          evidenceBackedConclusions: evidenceBacked.length,
          evidenceCoverage: conclusions.length
            ? evidenceBacked.length / conclusions.length
            : 0,
          completedRuns: countEvent("run-completed"),
          cancelledRuns: countEvent("run-cancelled"),
          failedRuns: countEvent("run-failed"),
          helpfulRate: rated.length
            ? graph.nodes.filter((node) => node.rating > 0).length / rated.length
            : null,
        };
      });
    const eligible = graphs.filter((graph) => graph.eligible);
    const activated = eligible.filter((graph) => graph.activated);
    const synthesisTimes = eligible
      .map((graph) => graph.timeToFirstSynthesisMinutes)
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);
    const median =
      synthesisTimes.length === 0
        ? null
        : synthesisTimes.length % 2
          ? synthesisTimes[Math.floor(synthesisTimes.length / 2)]!
          : (synthesisTimes[synthesisTimes.length / 2 - 1]! +
              synthesisTimes[synthesisTimes.length / 2]!) /
            2;
    const conclusions = eligible.reduce((sum, graph) => sum + graph.conclusions, 0);
    const evidenceBackedConclusions = eligible.reduce(
      (sum, graph) => sum + graph.evidenceBackedConclusions,
      0,
    );
    const returned = eligible.filter((graph) => graph.returnedAfter7Days).length;
    return {
      schemaVersion: 1,
      appVersion: APP_VERSION,
      generatedAt: now(),
      privacy:
        "local-only; excludes prompts, content, titles, source URLs, and credentials",
      definitions: {
        eligibleGraph: "A graph with at least one imported source or created branch.",
        activation:
          "The graph has a synthesis and at least one summarized conclusion with two distinct incoming evidence nodes.",
        evidenceBackedConclusion:
          "A summarized conclusion with at least two distinct incoming branch or reference nodes.",
        returnedAfter7Days:
          "The graph was opened again at least seven days after its first recorded open.",
      },
      summary: {
        eligibleGraphs: eligible.length,
        activatedGraphs: activated.length,
        activationRate: eligible.length ? activated.length / eligible.length : 0,
        medianTimeToFirstSynthesisMinutes: median,
        returnedAfter7DaysGraphs: returned,
        sevenDayReturnRate: eligible.length ? returned / eligible.length : 0,
        conclusions,
        evidenceBackedConclusions,
        evidenceCoverage: conclusions ? evidenceBackedConclusions / conclusions : 0,
        completedRuns: eligible.reduce((sum, graph) => sum + graph.completedRuns, 0),
        cancelledRuns: eligible.reduce((sum, graph) => sum + graph.cancelledRuns, 0),
        failedRuns: eligible.reduce((sum, graph) => sum + graph.failedRuns, 0),
      },
      graphs,
    };
  }

  exportGraphMarkdown(graphId: string): string | null {
    const graph = this.getGraph(graphId);
    if (!graph) return null;
    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
    const lines = [
      "---",
      `title: "${graph.graph.title.replaceAll('"', '\\"')}"`,
      "type: graphchat-graph",
      "---",
      "",
      `# ${graph.graph.title}`,
      "",
      graph.graph.description,
      "",
    ];
    for (const node of graph.nodes) {
      lines.push(`## ${node.title}`, "");
      lines.push(
        `- ID: \`${node.id}\``,
        `- Type: ${node.kind}`,
        `- Knowledge status: ${node.knowledgeStatus}`,
        `- Mastery: ${node.mastery}`,
      );
      if (node.tags.length) lines.push(`- Tags: ${node.tags.map((tag) => `#${tag.replace(/\s+/g, "-")}`).join(" ")}`);
      if (node.sourceUrl) lines.push(`- Source: ${node.sourceUrl}`);
      const outgoing = graph.edges
        .filter((edge) => edge.source === node.id)
        .map((edge) => {
          const target = nodeById.get(edge.target);
          return target ? `${edge.kind}: [[${target.title}]]` : null;
        })
        .filter((value): value is string => value !== null);
      if (outgoing.length) lines.push(`- Links: ${outgoing.join("; ")}`);
      lines.push("");
      if (node.prompt) lines.push(`> ${node.prompt}`, "");
      lines.push(node.content || node.summary, "");
    }
    return lines.join("\n");
  }

  undoGraph(graphId: string): GraphDocument | null {
    const revision = this.db
      .prepare(
        "SELECT id, snapshot FROM graph_revisions WHERE graph_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
      )
      .get(graphId) as { id: string; snapshot: string } | undefined;
    if (!revision) return null;
    const snapshot = JSON.parse(revision.snapshot) as GraphDocument;
    this.historyEnabled = false;
    try {
      this.db.prepare("DELETE FROM nodes WHERE graph_id = ?").run(graphId);
      const insertNode = this.db.prepare(`
        INSERT INTO nodes (
          id, graph_id, kind, title, prompt, content, summary, tags,
          knowledge_status, mastery, source_url, credibility, rating, context_snapshot,
          selected_text, x, y, status, provider, model, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const node of snapshot.nodes) {
        insertNode.run(
          node.id, graphId, node.kind, node.title, node.prompt, node.content,
          node.summary, JSON.stringify(node.tags), node.knowledgeStatus, node.mastery,
          node.sourceUrl, node.credibility, node.rating,
          node.contextSnapshot == null ? null : JSON.stringify(node.contextSnapshot),
          node.selectedText,
          node.x, node.y, node.status, node.provider, node.model, node.createdAt, node.updatedAt,
        );
      }
      const insertEdge = this.db.prepare("INSERT INTO edges VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      for (const edge of snapshot.edges) {
        insertEdge.run(
          edge.id, graphId, edge.source, edge.target, edge.kind, edge.label,
          edge.includeInContext ? 1 : 0, edge.createdAt,
        );
      }
      this.db.prepare("DELETE FROM graph_revisions WHERE id = ?").run(revision.id);
      this.touchGraph(graphId);
      return this.getGraph(graphId);
    } finally {
      this.historyEnabled = true;
    }
  }

  canUndo(graphId: string): boolean {
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM graph_revisions WHERE graph_id = ?")
      .get(graphId) as { count: number };
    return Number(row.count) > 0;
  }

  close() {
    this.db.close();
  }

  private touchGraph(id: string) {
    this.db.prepare("UPDATE graphs SET updated_at = ? WHERE id = ?").run(now(), id);
  }

  private recordRevision(graphId: string, label: string) {
    if (!this.historyEnabled) return;
    const snapshot = this.getGraph(graphId);
    if (!snapshot) return;
    this.db
      .prepare(
        "INSERT INTO graph_revisions (id, graph_id, label, snapshot, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(nanoid(), graphId, label, JSON.stringify(snapshot), now());
    const oldRows = this.db
      .prepare(
        "SELECT id FROM graph_revisions WHERE graph_id = ? ORDER BY created_at DESC, rowid DESC LIMIT -1 OFFSET 100",
      )
      .all(graphId) as Array<{ id: string }>;
    const remove = this.db.prepare("DELETE FROM graph_revisions WHERE id = ?");
    for (const row of oldRows) remove.run(row.id);
  }

  private mapNode = (row: Record<string, unknown>): GraphNode => ({
    id: String(row.id),
    graphId: String(row.graph_id),
    kind: row.kind as GraphNode["kind"],
    title: String(row.title),
    prompt: String(row.prompt),
    content: String(row.content),
    summary: String(row.summary),
    tags: (() => {
      try {
        return JSON.parse(String(row.tags || "[]")) as string[];
      } catch {
        return [];
      }
    })(),
    knowledgeStatus: (row.knowledge_status || "exploring") as GraphNode["knowledgeStatus"],
    mastery: (row.mastery || "new") as GraphNode["mastery"],
    sourceUrl: String(row.source_url || ""),
    credibility: row.credibility == null ? null : Number(row.credibility),
    rating: Number(row.rating || 0),
    contextSnapshot: (() => {
      if (row.context_snapshot == null) return null;
      try {
        return JSON.parse(String(row.context_snapshot)) as GraphNode["contextSnapshot"];
      } catch {
        return null;
      }
    })(),
    selectedText: row.selected_text == null ? null : String(row.selected_text),
    x: Number(row.x),
    y: Number(row.y),
    status: row.status as GraphNode["status"],
    provider: row.provider == null ? null : String(row.provider),
    model: row.model == null ? null : String(row.model),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  });

  private mapGraph = (row: Record<string, unknown>): GraphMeta => ({
    id: String(row.id),
    title: String(row.title),
    description: String(row.description),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    archivedAt: row.archived_at == null ? null : String(row.archived_at),
  });

  private mapEdge = (row: Record<string, unknown>): GraphEdge => ({
    id: String(row.id),
    graphId: String(row.graph_id),
    source: String(row.source),
    target: String(row.target),
    kind: row.kind as GraphEdge["kind"],
    label: String(row.label),
    includeInContext: bool(row.include_in_context),
    createdAt: String(row.created_at),
  });
}
