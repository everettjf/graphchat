import type { GraphEdge, GraphNode } from "@shared/types";

export const GRAPH_NODE_WIDTH = 304;
export const GRAPH_ROW_GAP = 236;
const COLUMN_GAP = 72;
const CANVAS_PADDING = 80;

const isStructuralEdge = (edge: GraphEdge) =>
  edge.kind === "branch" || edge.kind === "continuation";

export function getGraphDepth(nodes: GraphNode[], edges: GraphEdge[]): number {
  if (nodes.length === 0) return 0;
  const nodeIds = new Set(nodes.map((node) => node.id));
  const incoming = new Set<string>();
  const children = new Map<string, string[]>();
  for (const edge of edges.filter(isStructuralEdge)) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    incoming.add(edge.target);
    children.set(edge.source, [...(children.get(edge.source) || []), edge.target]);
  }

  const roots = nodes.filter((node) => !incoming.has(node.id));
  const queue = (roots.length > 0 ? roots : [nodes[0]]).map((node) => ({
    id: node.id,
    depth: 0,
  }));
  const visited = new Set<string>();
  let maxDepth = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.id)) continue;
    visited.add(current.id);
    maxDepth = Math.max(maxDepth, current.depth);
    for (const childId of children.get(current.id) || []) {
      queue.push({ id: childId, depth: current.depth + 1 });
    }
  }
  return maxDepth;
}

export function layoutGraphNodes(
  nodes: GraphNode[],
  edges: GraphEdge[],
): GraphNode[] {
  if (nodes.length === 0) return [];

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const parentByTarget = new Map<string, string>();
  const children = new Map<string, string[]>();

  for (const edge of edges.filter(isStructuralEdge)) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    if (parentByTarget.has(edge.target)) continue;
    parentByTarget.set(edge.target, edge.source);
    children.set(edge.source, [...(children.get(edge.source) || []), edge.target]);
  }

  const roots = nodes.filter((node) => !parentByTarget.has(node.id));
  const subtreeLanes = new Map<string, number>();
  const measuring = new Set<string>();
  const measure = (nodeId: string): number => {
    const cached = subtreeLanes.get(nodeId);
    if (cached !== undefined) return cached;
    if (measuring.has(nodeId)) return 1;
    measuring.add(nodeId);
    const width = Math.max(
      1,
      (children.get(nodeId) || []).reduce(
        (total, childId) => total + measure(childId),
        0,
      ),
    );
    measuring.delete(nodeId);
    subtreeLanes.set(nodeId, width);
    return width;
  };

  const positions = new Map<string, { x: number; y: number }>();
  const placed = new Set<string>();
  const laneWidth = GRAPH_NODE_WIDTH + COLUMN_GAP;
  const place = (nodeId: string, leftLane: number, depth: number) => {
    if (placed.has(nodeId)) return;
    placed.add(nodeId);
    const childIds = (children.get(nodeId) || []).filter(
      (childId) => !placed.has(childId),
    );
    const span = measure(nodeId);
    let centerLane = leftLane + span / 2;

    if (childIds.length > 0) {
      let childLeft = leftLane;
      const childCenters: number[] = [];
      for (const childId of childIds) {
        const childSpan = measure(childId);
        childCenters.push(childLeft + childSpan / 2);
        place(childId, childLeft, depth + 1);
        childLeft += childSpan;
      }
      centerLane =
        (childCenters[0] + childCenters[childCenters.length - 1]) / 2;
    }

    positions.set(nodeId, {
      x: CANVAS_PADDING + centerLane * laneWidth - GRAPH_NODE_WIDTH / 2,
      y: CANVAS_PADDING + depth * GRAPH_ROW_GAP,
    });
  };

  let nextLane = 0;
  for (const root of roots) {
    place(root.id, nextLane, 0);
    nextLane += measure(root.id) + 0.5;
  }
  for (const node of nodes) {
    if (placed.has(node.id)) continue;
    place(node.id, nextLane, 0);
    nextLane += measure(node.id) + 0.5;
  }

  return nodes.map((node) => ({
    ...node,
    ...(positions.get(node.id) || {}),
  }));
}
