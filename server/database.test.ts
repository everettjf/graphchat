// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { GraphDatabase } from "./database.js";

const directories: string[] = [];

function createDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "graphchat-test-"));
  directories.push(directory);
  return new GraphDatabase(directory);
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

    const backup = database.exportAll();
    const restored = database.restoreBackup(backup);
    expect(restored).toHaveLength(1);
    expect(restored[0]?.graph.title).toContain("(restored)");
    expect(restored[0]?.nodes).toHaveLength(before.nodes.length);
    expect(restored[0]?.edges).toHaveLength(before.edges.length);
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

  it("migrates a v0.1.1 database in place and marks schema version 2", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "graphchat-migration-"));
    directories.push(directory);
    const filename = path.join(directory, "graphchat.sqlite");
    const legacy = new DatabaseSync(filename);
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
    `);
    legacy.close();

    const migrated = new GraphDatabase(directory);
    expect(migrated.getGraph("learning-rag")?.nodes[0]).toMatchObject({
      tags: expect.any(Array),
      knowledgeStatus: expect.any(String),
      mastery: expect.any(String),
    });
    migrated.close();

    const inspected = new DatabaseSync(filename);
    expect(
      (
        inspected.prepare("PRAGMA user_version").get() as {
          user_version: number;
        }
      ).user_version,
    ).toBe(2);
    inspected.close();
  });

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
