// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GraphDatabase, type SQLiteDatabase } from "./database.js";

type SQLiteConstructor = new (filename: string) => SQLiteDatabase;

const TestDatabase: SQLiteConstructor = await (async () => {
  if (process.versions.bun) {
    const { Database } = await import("bun:sqlite");
    return Database as unknown as SQLiteConstructor;
  }

  const { DatabaseSync } = await import("node:sqlite");
  return DatabaseSync as unknown as SQLiteConstructor;
})();

const directories: string[] = [];

function createDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "graphchat-test-"));
  directories.push(directory);
  return new GraphDatabase(directory);
}

function rawDatabase(database: GraphDatabase): SQLiteDatabase {
  return (database as unknown as { db: SQLiteDatabase }).db;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("GraphDatabase", () => {
  it("seeds a usable example knowledge graph", () => {
    const database = createDatabase();
    const graphs = database.listGraphs();
    expect(graphs).toHaveLength(1);
    const graph = database.getGraph(graphs[0]!.id);
    expect(graph?.nodes.length).toBeGreaterThanOrEqual(6);
    expect(graph?.edges.some((edge) => edge.kind === "reference")).toBe(true);
    database.close();
  });

  it("creates a branch and cross-branch references transactionally", () => {
    const database = createDatabase();
    const graph = database.getGraph("learning-rag")!;
    const node = database.createNode({
      graphId: graph.graph.id,
      parentNodeId: "embedding",
      referenceNodeIds: ["vector-db"],
      kind: "question",
      title: "联合测试",
      prompt: "结合两个节点",
      content: "",
      summary: "",
      selectedText: null,
      x: 100,
      y: 200,
    });
    const updated = database.getGraph(graph.graph.id)!;
    expect(updated.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "embedding", target: node.id, kind: "branch" }),
        expect.objectContaining({ source: "vector-db", target: node.id, kind: "reference" }),
      ]),
    );
    const continued = database.createNode({
      graphId: graph.graph.id,
      parentNodeId: node.id,
      parentEdgeKind: "continuation",
      referenceNodeIds: [],
      kind: "answer",
      title: "Continue the same thread",
      prompt: "What happens next?",
      content: "",
      summary: "",
      selectedText: null,
      x: 560,
      y: 200,
    });
    expect(
      database
        .getGraph(graph.graph.id)!
        .edges.find((edge) => edge.target === continued.id),
    ).toMatchObject({
      source: node.id,
      kind: "continuation",
      label: "Continue",
    });
    database.close();
  });

  it("searches across titles, prompts, summaries and content", () => {
    const database = createDatabase();
    const results = database.searchNodes("learning-rag", "Embedding");
    expect(results.map((node) => node.id)).toContain("embedding");
    database.close();
  });

  it("imports structured notes and exposes study, metrics, metadata, and markdown export", () => {
    const database = createDatabase();
    const imported = database.importText({
      graphId: "learning-rag",
      title: "CAP theorem notes",
      format: "markdown",
      sourceUrl: "https://example.com/cap",
      content: "# Consistency\n\nEvery read sees the latest write.\n\n# Availability\n\nEvery request receives a response.",
    });
    expect(imported).toHaveLength(2);
    expect(imported[0]).toMatchObject({
      title: "Consistency",
      tags: ["imported"],
      sourceUrl: "https://example.com/cap",
      mastery: "new",
    });

    const updated = database.updateNode(imported[1]!.id, {
      knowledgeStatus: "conclusion",
      mastery: "mastered",
      rating: 1,
      tags: ["distributed-systems", "cap"],
    });
    expect(updated).toMatchObject({
      knowledgeStatus: "conclusion",
      mastery: "mastered",
      rating: 1,
    });
    expect(database.searchNodes("learning-rag", "distributed-systems")).toHaveLength(1);
    expect(database.getStudyCards("learning-rag").some((card) => card.nodeId === imported[0]!.id)).toBe(true);
    expect(database.getMetrics("learning-rag")).toMatchObject({
      nodes: 8,
      conclusions: 1,
      mastered: 1,
      firstBranchAt: expect.any(String),
      activityLast7Days: expect.any(Number),
    });
    expect(database.exportGraphMarkdown("learning-rag")).toContain(
      "Source: https://example.com/cap",
    );
    database.close();
  });

  it("suggests metadata, ranks structured matches, restores backups, and undoes mutations", () => {
    const database = createDatabase();
    const before = database.getGraph("learning-rag")!;
    const suggestion = database.suggestMetadata("embedding");
    expect(suggestion?.tags.length).toBeGreaterThan(0);
    expect(suggestion?.summary).toContain("embedding");

    database.updateNode("embedding", {
      title: "Exact retrieval target",
      tags: ["semantic-search"],
    });
    expect(database.searchNodes("learning-rag", "Exact retrieval target")[0]?.id).toBe("embedding");
    expect(database.canUndo("learning-rag")).toBe(true);
    expect(database.undoGraph("learning-rag")?.nodes.find((node) => node.id === "embedding")?.title)
      .toBe(before.nodes.find((node) => node.id === "embedding")?.title);

    const edge = before.edges[0]!;
    rawDatabase(database)
      .prepare("UPDATE edges SET include_in_context = 0 WHERE id = ?")
      .run(edge.id);
    const backup = database.exportAll();
    expect(backup.version).toBe(2);
    const restored = database.restoreBackup(backup);
    expect(restored).toHaveLength(1);
    expect(restored[0]?.graph.title).toContain("(restored)");
    expect(restored[0]?.nodes).toHaveLength(before.nodes.length);
    expect(restored[0]?.edges).toHaveLength(before.edges.length);
    const restoredSource = restored[0]!.nodes.find(
      (node) => node.title === before.nodes.find((item) => item.id === edge.source)!.title,
    )!;
    const restoredTarget = restored[0]!.nodes.find(
      (node) => node.title === before.nodes.find((item) => item.id === edge.target)!.title,
    )!;
    expect(
      restored[0]!.edges.find(
        (item) => item.source === restoredSource.id && item.target === restoredTarget.id,
      )?.includeInContext,
    ).toBe(false);
    database.close();
  });

  it("never persists an API-key presence flag with provider settings", () => {
    const database = createDatabase();
    database.saveSettings({
      provider: "openai",
      model: "gpt-test",
      baseUrl: "",
      hasApiKey: true,
    });
    expect(database.getSettings()).toMatchObject({
      provider: "openai",
      model: "gpt-test",
      hasApiKey: false,
    });
    database.close();
  });

  it("recovers unfinished streaming nodes after a restart", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "graphchat-test-"));
    directories.push(directory);
    const first = new GraphDatabase(directory);
    const node = first.createNode({
      graphId: "learning-rag",
      parentNodeId: "root-rag",
      referenceNodeIds: [],
      kind: "answer",
      title: "Interrupted answer",
      prompt: "Keep this safe",
      content: "",
      summary: "",
      selectedText: null,
      x: 900,
      y: 500,
    });
    first.updateNode(node.id, { status: "streaming" });
    first.close();

    const reopened = new GraphDatabase(directory);
    expect(reopened.getNode(node.id)).toMatchObject({
      status: "error",
      content: expect.stringContaining("interrupted"),
    });
    reopened.close();
  });

  it("creates, renames, archives, and restores knowledge graphs", () => {
    const database = createDatabase();
    const created = database.createGraph({
      title: "Distributed systems",
      description: "A fresh learning space",
    });
    expect(created.nodes).toEqual([]);
    expect(database.listGraphs()).toHaveLength(2);

    expect(
      database.updateGraph(created.graph.id, {
        title: "Reliable distributed systems",
      }),
    ).toMatchObject({
      title: "Reliable distributed systems",
      description: "A fresh learning space",
    });

    const archived = database.archiveGraph(created.graph.id);
    expect(archived?.archivedAt).toEqual(expect.any(String));
    expect(database.listGraphs().map((graph) => graph.id)).not.toContain(
      created.graph.id,
    );
    expect(database.listArchivedGraphs().map((graph) => graph.id)).toContain(
      created.graph.id,
    );

    expect(database.restoreGraph(created.graph.id)).toMatchObject({
      archivedAt: null,
    });
    expect(database.listGraphs().map((graph) => graph.id)).toContain(
      created.graph.id,
    );
    database.close();
  });

  it("does not archive the last active graph", () => {
    const database = createDatabase();
    expect(() => database.archiveGraph("learning-rag")).toThrow(
      "LAST_ACTIVE_GRAPH",
    );
    database.close();
  });

  it("keeps the full-text index synchronized across updates and deletes", () => {
    const database = createDatabase();
    const node = database.createNode({
      graphId: "learning-rag",
      parentNodeId: null,
      referenceNodeIds: [],
      kind: "note",
      title: "Xylophonic marker",
      prompt: "",
      content: "Initial searchable material",
      summary: "",
      selectedText: null,
      x: 0,
      y: 0,
    });
    expect(database.searchNodes("learning-rag", "xylophonic")[0]?.id).toBe(
      node.id,
    );

    database.updateNode(node.id, {
      title: "Completely renamed note",
      content: "A heliotropic replacement phrase",
    });
    expect(database.searchNodes("learning-rag", "xylophonic")).toHaveLength(0);
    expect(database.searchNodes("learning-rag", "heliotropic")[0]?.id).toBe(node.id);

    database.deleteNode(node.id);
    expect(database.searchNodes("learning-rag", "heliotropic")).toHaveLength(0);
    database.close();
  });

  it("supports substring retrieval for Chinese text", () => {
    const database = createDatabase();
    const node = database.createNode({
      graphId: "learning-rag",
      parentNodeId: null,
      referenceNodeIds: [],
      kind: "note",
      title: "分布式系统中的一致性协议",
      prompt: "",
      content: "",
      summary: "",
      selectedText: null,
      x: 0,
      y: 0,
    });
    expect(database.searchNodes("learning-rag", "一致性")[0]?.id).toBe(node.id);
    database.close();
  });

  it("updates an entire graph layout atomically", () => {
    const database = createDatabase();
    const before = database.getGraph("learning-rag")!;
    const targets = before.nodes.slice(0, 2);
    const updated = database.updateGraphLayout("learning-rag", {
      positions: targets.map((node, index) => ({
        id: node.id,
        x: 1_000 + index * 100,
        y: 2_000 + index * 100,
      })),
    });

    expect(updated).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: targets[0]!.id, x: 1_000, y: 2_000 }),
        expect.objectContaining({ id: targets[1]!.id, x: 1_100, y: 2_100 }),
      ]),
    );
    database.close();
  });

  it("rejects a layout containing nodes from another graph without moving any node", () => {
    const database = createDatabase();
    const other = database.createGraph({
      title: "Other graph",
      description: "",
    });
    const otherNode = database.createNode({
      graphId: other.graph.id,
      parentNodeId: null,
      referenceNodeIds: [],
      kind: "note",
      title: "Other graph node",
      prompt: "",
      content: "",
      summary: "",
      selectedText: null,
      x: 0,
      y: 0,
    });
    const original = database.getNode("embedding")!;

    expect(() =>
      database.updateGraphLayout("learning-rag", {
        positions: [
          { id: original.id, x: 9_999, y: 9_999 },
          { id: otherNode.id, x: 100, y: 100 },
        ],
      }),
    ).toThrow("LAYOUT_NODE_MISMATCH");
    expect(database.getNode(original.id)).toMatchObject({
      x: original.x,
      y: original.y,
    });
    database.close();
  });

  it("permanently deletes only archived graphs, individually or in bulk", () => {
    const database = createDatabase();
    const first = database.createGraph({
      title: "First archived graph",
      description: "",
    });
    const second = database.createGraph({
      title: "Second archived graph",
      description: "",
    });
    database.archiveGraph(first.graph.id);
    database.archiveGraph(second.graph.id);

    expect(database.deleteArchivedGraph("learning-rag")).toBeNull();
    expect(database.getGraph("learning-rag")).not.toBeNull();
    expect(database.deleteArchivedGraph(first.graph.id)).toMatchObject({
      id: first.graph.id,
      archivedAt: expect.any(String),
    });
    expect(database.getGraph(first.graph.id)).toBeNull();
    expect(database.deleteAllArchivedGraphs()).toBe(1);
    expect(database.listArchivedGraphs()).toEqual([]);
    expect(database.getGraph(second.graph.id)).toBeNull();
    expect(database.getGraph("learning-rag")).not.toBeNull();
    database.close();
  });

  it("migrates a v0.1.1 database in place and marks schema version 4", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "graphchat-migration-"));
    directories.push(directory);
    const filename = path.join(directory, "graphchat.sqlite");
    const legacy = new TestDatabase(filename);
    legacy.exec(`
      CREATE TABLE graphs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT
      );
      CREATE TABLE nodes (
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
      CREATE TABLE edges (
        id TEXT PRIMARY KEY,
        graph_id TEXT NOT NULL,
        source TEXT NOT NULL,
        target TEXT NOT NULL,
        kind TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        include_in_context INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );
      INSERT INTO graphs VALUES (
        'legacy-graph', 'Legacy knowledge', 'Preserve me',
        '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z', NULL
      );
      INSERT INTO nodes (
        id, graph_id, kind, title, prompt, content, summary, selected_text,
        x, y, status, provider, model, created_at, updated_at
      ) VALUES
        ('legacy-root', 'legacy-graph', 'question', 'Legacy root', '', 'root content', '', NULL,
         0, 0, 'complete', NULL, NULL, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'),
        ('legacy-child', 'legacy-graph', 'answer', 'Legacy child', '', 'child content', '', NULL,
         100, 100, 'complete', NULL, NULL, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');
      INSERT INTO edges VALUES (
        'legacy-edge', 'legacy-graph', 'legacy-root', 'legacy-child', 'branch', '', 1,
        '2025-01-01T00:00:00.000Z'
      );
    `);
    legacy.close();

    const migrated = new GraphDatabase(directory);
    const migratedGraph = migrated.getGraph("legacy-graph")!;
    expect(migratedGraph.graph).toMatchObject({ title: "Legacy knowledge", description: "Preserve me" });
    expect(migratedGraph.nodes.find((node) => node.id === "legacy-root")).toMatchObject({
      content: "root content",
      tags: expect.any(Array),
      knowledgeStatus: expect.any(String),
      mastery: expect.any(String),
    });
    expect(migratedGraph.edges).toContainEqual(
      expect.objectContaining({
        id: "legacy-edge",
        kind: "continuation",
        label: "Continue",
      }),
    );
    expect(migrated.searchNodes("legacy-graph", "child content")[0]?.id).toBe("legacy-child");
    migrated.close();

    const inspected = new TestDatabase(filename);
    expect(
      (
        inspected.prepare("PRAGMA user_version").get() as {
          user_version: number;
        }
      ).user_version,
    ).toBe(4);
    inspected.close();
  });

  it("reads, searches, and exports a 5,000-node graph within the performance budget", () => {
    const database = createDatabase();
    const raw = rawDatabase(database);
    const graph = database.createGraph({ title: "Large graph", description: "performance fixture" });
    const timestamp = "2026-01-01T00:00:00.000Z";
    const insertNode = raw.prepare(`
      INSERT INTO nodes (
        id, graph_id, kind, title, prompt, content, summary, tags,
        knowledge_status, mastery, source_url, credibility, rating, context_snapshot,
        selected_text, x, y, status, provider, model, created_at, updated_at
      ) VALUES (?, ?, 'note', ?, '', ?, '', '[]', 'exploring', 'new', '', NULL, 0, NULL,
        NULL, ?, ?, 'complete', NULL, NULL, ?, ?)
    `);
    const insertEdge = raw.prepare(
      "INSERT INTO edges VALUES (?, ?, ?, ?, 'continuation', 'Continue', 1, ?)",
    );
    raw.exec("BEGIN IMMEDIATE");
    for (let index = 0; index < 5_000; index += 1) {
      const id = `large-${index}`;
      insertNode.run(
        id,
        graph.graph.id,
        `Large node ${index}`,
        index === 4_999 ? "terminal-needle" : `content ${index}`,
        index % 100 * 320,
        Math.floor(index / 100) * 180,
        timestamp,
        timestamp,
      );
      if (index > 0) {
        insertEdge.run(`large-edge-${index}`, graph.graph.id, `large-${index - 1}`, id, timestamp);
      }
    }
    raw.exec("COMMIT");

    const startedAt = performance.now();
    const loaded = database.getGraph(graph.graph.id)!;
    const matches = database.searchNodes(graph.graph.id, "terminal-needle");
    const backup = database.exportAll();
    const elapsed = performance.now() - startedAt;

    expect(loaded.nodes).toHaveLength(5_000);
    expect(loaded.edges).toHaveLength(4_999);
    expect(matches[0]?.id).toBe("large-4999");
    expect(backup.graphs.find((item) => item.graph.id === graph.graph.id)?.nodes).toHaveLength(5_000);
    expect(elapsed).toBeLessThan(2_500);
    database.close();
  }, 15_000);

  it("exports privacy-safe activation, evidence, session, and reliability metrics", () => {
    const database = createDatabase();
    const graph = database.createGraph({
      title: "Private pilot graph",
      description: "Must not appear in validation export",
    });
    const day = 86_400_000;
    const openedAt = new Date("2026-01-01T00:00:00.000Z");
    database.recordEvent(
      graph.graph.id,
      "graph-opened",
      { sessionId: "pilot-session-1", appVersion: "0.2.0" },
      openedAt.toISOString(),
    );
    database.importText({
      graphId: graph.graph.id,
      title: "Secret source title",
      content: "# Evidence A\n\nPrivate source content\n\n# Evidence B\n\nMore private content",
      sourceUrl: "https://private.example/source",
      format: "markdown",
    });
    const imported = database.getGraph(graph.graph.id)!.nodes;
    const synthesis = database.createNode({
      graphId: graph.graph.id,
      parentNodeId: imported[0]!.id,
      referenceNodeIds: [imported[1]!.id],
      kind: "summary",
      title: "Private conclusion title",
      prompt: "Private pilot prompt",
      content: "Private answer",
      summary: "Evidence-backed summary",
      selectedText: null,
      x: 100,
      y: 100,
    });
    database.updateNode(synthesis.id, { knowledgeStatus: "conclusion", rating: 1 });
    database.recordEvent(graph.graph.id, "run-completed", {
      mode: "synthesize",
      durationMs: 1200,
    });
    database.recordEvent(
      graph.graph.id,
      "graph-opened",
      { sessionId: "pilot-session-2", appVersion: "0.2.0" },
      new Date(openedAt.getTime() + 8 * day).toISOString(),
    );

    const report = database.getProductValidationReport();
    const pilot = report.graphs.find((entry) => entry.graphId === graph.graph.id);
    expect(pilot).toMatchObject({
      eligible: true,
      activated: true,
      distinctSessions: 2,
      returnedAfter7Days: true,
      evidenceBackedConclusions: 1,
      evidenceCoverage: 1,
      completedRuns: 1,
      helpfulRate: 1,
    });
    expect(report.summary).toMatchObject({
      eligibleGraphs: 1,
      activatedGraphs: 1,
      activationRate: 1,
      sevenDayReturnRate: 1,
      evidenceCoverage: 1,
    });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("Private pilot prompt");
    expect(serialized).not.toContain("Private source content");
    expect(serialized).not.toContain("private.example");
    expect(serialized).not.toContain("Private conclusion title");
    database.close();
  });
});
