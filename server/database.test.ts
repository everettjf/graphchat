// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
});
