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
});
