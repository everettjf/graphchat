import type { ContextItem, ContextSnapshot, GraphDocument } from "../shared/types.js";

export type CompileContextInput = {
  graph: GraphDocument;
  parentNodeId: string | null;
  referenceNodeIds: string[];
  selectedText: string | null;
  maxEstimatedTokens?: number;
};

const estimateTokens = (text: string) => Math.max(1, Math.ceil(text.length / 3));

export function compileContext({
  graph,
  parentNodeId,
  referenceNodeIds,
  selectedText,
  maxEstimatedTokens = 8_000,
}: CompileContextInput): ContextSnapshot {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const incomingBranch = new Map<string, string>();
  for (const edge of graph.edges) {
    if (edge.kind === "branch") incomingBranch.set(edge.target, edge.source);
  }

  const mainPathIds: string[] = [];
  let cursor = parentNodeId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    mainPathIds.unshift(cursor);
    cursor = incomingBranch.get(cursor) ?? null;
  }

  const candidates: ContextItem[] = [];
  for (const nodeId of mainPathIds) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;
    const content = [node.prompt && `问题：${node.prompt}`, node.content].filter(Boolean).join("\n");
    candidates.push({
      nodeId,
      title: node.title,
      reason: "main-path",
      detail: "full",
      content,
      estimatedTokens: estimateTokens(content),
    });
  }

  for (const nodeId of referenceNodeIds) {
    if (mainPathIds.includes(nodeId)) continue;
    const node = nodeMap.get(nodeId);
    if (!node) continue;
    const content = node.summary || node.content;
    candidates.push({
      nodeId,
      title: node.title,
      reason: "reference",
      detail: node.summary ? "summary" : "full",
      content,
      estimatedTokens: estimateTokens(content),
    });
  }

  if (selectedText && parentNodeId) {
    const node = nodeMap.get(parentNodeId);
    candidates.push({
      nodeId: parentNodeId,
      title: node?.title ?? "选中的原文",
      reason: "selection",
      detail: "selection",
      content: selectedText,
      estimatedTokens: estimateTokens(selectedText),
    });
  }

  const selected: ContextItem[] = [];
  const omittedNodeIds: string[] = [];
  let total = 0;
  for (const item of candidates) {
    if (total + item.estimatedTokens > maxEstimatedTokens && selected.length > 0) {
      omittedNodeIds.push(item.nodeId);
      continue;
    }
    selected.push(item);
    total += item.estimatedTokens;
  }

  return { items: selected, estimatedTokens: total, omittedNodeIds };
}

export function contextToPrompt(snapshot: ContextSnapshot): string {
  if (snapshot.items.length === 0) return "没有额外的图谱上下文。";
  return snapshot.items
    .map(
      (item, index) =>
        `[来源 ${index + 1} · 节点 ${item.nodeId} · ${item.title}]\n${item.content}`,
    )
    .join("\n\n");
}
