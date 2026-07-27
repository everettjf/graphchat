import { describe, expect, it } from "vitest";
import type { GraphDocument } from "../shared/types.js";
import { compileContext } from "./context-compiler.js";

const timestamp = "2026-01-01T00:00:00.000Z";
const graph: GraphDocument = {
  graph: {
    id: "g",
    title: "G",
    description: "",
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
  },
  nodes: ["a", "b", "c"].map((id, index) => ({
    id,
    graphId: "g",
    kind: "answer",
    title: id.toUpperCase(),
    prompt: `q-${id}`,
    content: `content-${id}`,
    summary: `summary-${id}`,
    selectedText: null,
    x: index * 100,
    y: 0,
    status: "complete",
    provider: "demo",
    model: "demo",
    createdAt: timestamp,
    updatedAt: timestamp,
  })),
  edges: [
    { id: "e1", graphId: "g", source: "a", target: "b", kind: "branch", label: "", includeInContext: true, createdAt: timestamp },
  ],
};

describe("compileContext", () => {
  it("keeps the main path in chronological order and adds references", () => {
    const result = compileContext({
      graph,
      parentNodeId: "b",
      referenceNodeIds: ["c"],
      selectedText: null,
    });
    expect(result.items.map((item) => item.nodeId)).toEqual(["a", "b", "c"]);
    expect(result.items[2]?.detail).toBe("summary");
  });

  it("records selected source text explicitly", () => {
    const result = compileContext({
      graph,
      parentNodeId: "b",
      referenceNodeIds: [],
      selectedText: "a quoted term",
    });
    expect(result.items.at(-1)).toMatchObject({
      reason: "selection",
      content: "a quoted term",
    });
  });
});
