import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type {
  CreateNodeInput,
  GraphDocument,
  GraphEdge,
  GraphMeta,
  GraphNode,
  ProviderSettings,
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
    this.seed();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS graphs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
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
  }

  private seed() {
    const count = this.db.prepare("SELECT COUNT(*) AS count FROM graphs").get() as { count: number };
    if (Number(count.count) > 0) return;

    const timestamp = now();
    const graph: GraphMeta = {
      id: "learning-rag",
      title: "理解 RAG：从陌生概念到完整图景",
      description: "一个展示分叉、追问与知识汇聚的示例学习图",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.db
      .prepare("INSERT INTO graphs VALUES (?, ?, ?, ?, ?)")
      .run(graph.id, graph.title, graph.description, graph.createdAt, graph.updatedAt);

    const nodes: GraphNode[] = [
      {
        id: "root-rag",
        graphId: graph.id,
        kind: "answer",
        title: "RAG 是什么？",
        prompt: "用容易理解的方式介绍 RAG，以及它为什么有用。",
        content:
          "RAG（检索增强生成）让模型在回答前，先从你的资料中检索相关内容，再基于这些内容生成答案。\n\n它通常包含三个步骤：把资料转换为 **Embedding** 并保存；根据问题在**向量数据库**中寻找相关片段；把片段和问题一起交给模型。这样可以补充模型没有见过的私有或最新信息，并让回答更容易追溯来源。",
        summary: "RAG 通过检索外部资料增强模型回答，核心环节包括 Embedding、向量检索和生成。",
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
        title: "Embedding 到底是什么？",
        prompt: "这里说的 Embedding 是什么意思？请用类比解释。",
        content:
          "Embedding 可以理解为给一段文字生成一组“语义坐标”。意思相近的文字，在这个高维空间中的位置也更接近。\n\n例如“如何给植物浇水”和“绿植多久补一次水”用词不同，但语义接近，因此它们的向量距离通常很小。",
        summary: "Embedding 是文本的语义坐标，使含义相近的内容在向量空间中彼此接近。",
        selectedText: "把资料转换为 Embedding 并保存",
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
        title: "为什么叫“高维空间”？",
        prompt: "这里的高维空间是真实空间吗？维度代表什么？",
        content:
          "它不是我们所在的物理空间，而是数学上的坐标系统。每个维度由模型学习得到，通常不能简单解释成“情绪”或“主题”这样的单一含义；整体坐标共同表达语义特征。\n\n实际使用中，我们更关心两个向量的距离，而不是逐个解释维度。",
        summary: "高维空间是数学表示；单个维度通常不可解释，向量间距离才是重点。",
        selectedText: "高维空间",
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
        title: "向量数据库做了什么？",
        prompt: "向量数据库和普通数据库有什么区别？",
        content:
          "普通数据库擅长精确匹配，例如查找订单号；向量数据库擅长相似性搜索，例如寻找“意思最接近当前问题”的资料片段。\n\n它保存向量及其原文、来源等元数据，并使用近似最近邻索引在大量内容中快速找到相似项。",
        summary: "向量数据库负责保存语义向量，并高效搜索与问题最相似的资料片段。",
        selectedText: "向量数据库",
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
        title: "相似性是怎么计算的？",
        prompt: "系统怎么判断两个向量相似？",
        content:
          "常见方法包括余弦相似度、点积和欧氏距离。余弦相似度比较两个向量方向是否接近，因此对长度变化不太敏感；具体选择取决于 Embedding 模型的训练方式和推荐设置。",
        summary: "向量相似性常通过余弦相似度、点积或欧氏距离计算。",
        selectedText: "相似性搜索",
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
        title: "Embedding 与向量数据库如何配合？",
        prompt: "结合两个分支，解释它们在 RAG 中分别扮演什么角色。",
        content:
          "Embedding 模型负责把问题和资料翻译成同一种“语义坐标”；向量数据库负责保存这些坐标并迅速找到附近的资料。\n\n可以把前者看作制图规则，后者看作带有快速导航能力的地图。RAG 再把导航找到的原文交给生成模型组织答案。",
        summary: "Embedding 负责建立语义坐标，向量数据库负责保存和检索，二者共同完成 RAG 的检索阶段。",
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
      { graphId: graph.id, source: "root-rag", target: "embedding", kind: "branch", label: "解释术语", includeInContext: true },
      { graphId: graph.id, source: "embedding", target: "vector-space", kind: "branch", label: "继续追问", includeInContext: true },
      { graphId: graph.id, source: "root-rag", target: "vector-db", kind: "branch", label: "解释术语", includeInContext: true },
      { graphId: graph.id, source: "vector-db", target: "similarity", kind: "branch", label: "继续追问", includeInContext: true },
      { graphId: graph.id, source: "embedding", target: "synthesis", kind: "reference", label: "联合理解", includeInContext: true },
      { graphId: graph.id, source: "vector-db", target: "synthesis", kind: "reference", label: "联合理解", includeInContext: true },
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
    return (this.db.prepare("SELECT * FROM graphs ORDER BY updated_at DESC").all() as Record<string, unknown>[]).map(
      (row) => ({
        id: String(row.id),
        title: String(row.title),
        description: String(row.description),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      }),
    );
  }

  getGraph(id: string): GraphDocument | null {
    const graphRow = this.db.prepare("SELECT * FROM graphs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!graphRow) return null;
    const graph: GraphMeta = {
      id: String(graphRow.id),
      title: String(graphRow.title),
      description: String(graphRow.description),
      createdAt: String(graphRow.created_at),
      updatedAt: String(graphRow.updated_at),
    };
    const nodes = (this.db.prepare("SELECT * FROM nodes WHERE graph_id = ? ORDER BY created_at").all(id) as Record<string, unknown>[]).map(
      this.mapNode,
    );
    const edges = (this.db.prepare("SELECT * FROM edges WHERE graph_id = ? ORDER BY created_at").all(id) as Record<string, unknown>[]).map(
      this.mapEdge,
    );
    return { graph, nodes, edges };
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

  exportAll() {
    return {
      version: 1,
      exportedAt: now(),
      graphs: this.listGraphs().map((graph) => this.getGraph(graph.id)),
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
