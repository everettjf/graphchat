import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type {
  CreateGraphInput,
  CreateNodeInput,
  GraphDocument,
  GraphEdge,
  GraphMeta,
  GraphNode,
  ProviderSettings,
  UpdateGraphInput,
  UpdateNodeInput,
} from "../shared/types.js";

const now = () => new Date().toISOString();

interface SQLiteStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
}

interface SQLiteDatabase {
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

  constructor(dataDirectory = process.env.GRAPHCHAT_DATA_DIR || ".graphchat") {
    const absoluteDirectory = path.resolve(dataDirectory);
    fs.mkdirSync(absoluteDirectory, { recursive: true });
    this.db = new DatabaseConstructor(path.join(absoluteDirectory, "graphchat.sqlite"));
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.migrate();
    this.recoverInterruptedRuns();
    this.seed();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS graphs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT
      );
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        prompt TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL DEFAULT '',
        selected_text TEXT,
        x REAL NOT NULL,
        y REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'complete',
        provider TEXT,
        model TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS edges (
        id TEXT PRIMARY KEY,
        graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
        source TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        target TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        include_in_context INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_nodes_graph ON nodes(graph_id);
      CREATE INDEX IF NOT EXISTS idx_edges_graph ON edges(graph_id);
      CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target);
    `);
    const graphColumns = this.db
      .prepare("PRAGMA table_info(graphs)")
      .all() as Array<{ name: string }>;
    if (!graphColumns.some((column) => column.name === "archived_at")) {
      this.db.exec("ALTER TABLE graphs ADD COLUMN archived_at TEXT;");
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

    const nodes: GraphNode[] = [
      {
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
        id, graph_id, kind, title, prompt, content, summary, selected_text,
        x, y, status, provider, model, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

  getNode(id: string): GraphNode | null {
    const row = this.db.prepare("SELECT * FROM nodes WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? this.mapNode(row) : null;
  }

  createNode(input: CreateNodeInput, provider: string | null = null, model: string | null = null): GraphNode {
    const timestamp = now();
    const node: GraphNode = {
      id: nanoid(),
      graphId: input.graphId,
      kind: input.kind,
      title: input.title,
      prompt: input.prompt,
      content: input.content,
      summary: input.summary,
      selectedText: input.selectedText,
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
          id, graph_id, kind, title, prompt, content, summary, selected_text,
          x, y, status, provider, model, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        node.id,
        node.graphId,
        node.kind,
        node.title,
        node.prompt,
        node.content,
        node.summary,
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
    for (const referenceNodeId of input.referenceNodeIds) {
      if (referenceNodeId !== input.parentNodeId) {
        this.createEdge(input.graphId, referenceNodeId, node.id, "reference", "引用");
      }
    }
    this.touchGraph(input.graphId);
    return node;
  }

  updateNode(id: string, input: UpdateNodeInput & { provider?: string | null; model?: string | null }): GraphNode | null {
    const existing = this.getNode(id);
    if (!existing) return null;
    const next = { ...existing, ...input, updatedAt: now() };
    this.db
      .prepare(`
        UPDATE nodes SET title=?, prompt=?, content=?, summary=?, x=?, y=?,
          status=?, provider=?, model=?, updated_at=? WHERE id=?
      `)
      .run(
        next.title,
        next.prompt,
        next.content,
        next.summary,
        next.x,
        next.y,
        next.status,
        next.provider,
        next.model,
        next.updatedAt,
        id,
      );
    this.touchGraph(existing.graphId);
    return next;
  }

  deleteNode(id: string): boolean {
    const existing = this.getNode(id);
    if (!existing) return false;
    this.db.prepare("DELETE FROM nodes WHERE id = ?").run(id);
    this.touchGraph(existing.graphId);
    return true;
  }

  searchNodes(graphId: string, query: string, limit = 6): GraphNode[] {
    const pattern = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    return (
      this.db
        .prepare(`
          SELECT * FROM nodes
          WHERE graph_id = ?
            AND (title LIKE ? ESCAPE '\\' OR prompt LIKE ? ESCAPE '\\'
              OR content LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\')
          ORDER BY updated_at DESC
          LIMIT ?
        `)
        .all(graphId, pattern, pattern, pattern, pattern, limit) as Record<string, unknown>[]
    ).map(this.mapNode);
  }

  createEdge(
    graphId: string,
    source: string,
    target: string,
    kind: GraphEdge["kind"],
    label = "",
  ): GraphEdge {
    const edge: GraphEdge = {
      id: nanoid(),
      graphId,
      source,
      target,
      kind,
      label,
      includeInContext: true,
      createdAt: now(),
    };
    this.db
      .prepare("INSERT INTO edges VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(edge.id, graphId, source, target, kind, label, 1, edge.createdAt);
    this.touchGraph(graphId);
    return edge;
  }

  getSettings(): ProviderSettings {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = 'provider'").get() as { value: string } | undefined;
    if (!row) return { provider: "demo", model: "graphchat-guide", baseUrl: "", hasApiKey: false };
    return { ...(JSON.parse(row.value) as ProviderSettings), hasApiKey: false };
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

  exportAll() {
    return {
      version: 1,
      exportedAt: now(),
      graphs: [...this.listGraphs(), ...this.listArchivedGraphs()].map((graph) =>
        this.getGraph(graph.id),
      ),
    };
  }

  close() {
    this.db.close();
  }

  private touchGraph(id: string) {
    this.db.prepare("UPDATE graphs SET updated_at = ? WHERE id = ?").run(now(), id);
  }

  private mapNode = (row: Record<string, unknown>): GraphNode => ({
    id: String(row.id),
    graphId: String(row.graph_id),
    kind: row.kind as GraphNode["kind"],
    title: String(row.title),
    prompt: String(row.prompt),
    content: String(row.content),
    summary: String(row.summary),
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
