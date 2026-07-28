import { describe, expect, it } from "vitest";
import type { GraphEdge, GraphNode } from "@shared/types";
import { getGraphDepth, layoutGraphNodes } from "./graph-layout";

function node(id: string): GraphNode {
  return {
    id,
    graphId: "graph",
    kind: "answer",
    title: id,
    prompt: id,
    content: id,
    summary: id,
    tags: [],
    knowledgeStatus: "exploring",
    mastery: "new",
    sourceUrl: "",
    credibility: null,
    rating: 0,
    contextSnapshot: null,
    selectedText: null,
    x: 0,
    y: 0,
    status: "complete",
    provider: "openai-codex",
    model: "gpt-5.4-mini",
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
  };
}

function edge(source: string, target: string): GraphEdge {
  return {
    id: `${source}-${target}`,
    graphId: "graph",
    source,
    target,
    kind: "branch",
    label: "",
    includeInContext: true,
    createdAt: "2026-07-28T00:00:00.000Z",
  };
}

describe("layoutGraphNodes", () => {
  it("keeps a deep single branch on one readable vertical spine", () => {
    const nodes = Array.from({ length: 11 }, (_, index) => node(`${index}`));
    const edges = nodes.slice(1).map((current, index) =>
      edge(nodes[index].id, current.id),
    );

    const result = layoutGraphNodes(nodes, edges);

    expect(new Set(result.map((item) => item.x)).size).toBe(1);
    expect(result.map((item) => item.y)).toEqual(
      [...result.map((item) => item.y)].sort((a, b) => a - b),
    );
    expect(result.at(-1)!.y).toBeGreaterThan(result[0].y);
    expect(getGraphDepth(nodes, edges)).toBe(10);
  });

  it("centers a parent above sibling branches", () => {
    const nodes = [node("root"), node("left"), node("right")];
    const result = layoutGraphNodes(nodes, [
      edge("root", "left"),
      edge("root", "right"),
    ]);
    const byId = new Map(result.map((item) => [item.id, item]));

    expect(byId.get("left")!.x).toBeLessThan(byId.get("root")!.x);
    expect(byId.get("right")!.x).toBeGreaterThan(byId.get("root")!.x);
    expect(byId.get("left")!.y).toBe(byId.get("right")!.y);
    expect(byId.get("root")!.y).toBeLessThan(byId.get("left")!.y);
    expect(getGraphDepth(nodes, [
      edge("root", "left"),
      edge("root", "right"),
    ])).toBe(1);
  });

  it("ignores reference edges when calculating hierarchy", () => {
    const reference = {
      ...edge("root", "reference"),
      kind: "reference" as const,
    };
    const result = layoutGraphNodes(
      [node("root"), node("child"), node("reference")],
      [edge("root", "child"), reference],
    );
    const byId = new Map(result.map((item) => [item.id, item]));

    expect(byId.get("child")!.y).toBeGreaterThan(byId.get("root")!.y);
    expect(byId.get("reference")!.y).toBe(byId.get("root")!.y);
  });
});
