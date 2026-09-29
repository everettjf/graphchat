import fs from "node:fs";
import path from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { GraphDocument, GraphNode } from "../shared/types.js";
import type { GraphDatabase } from "./database.js";

/** Mirror Pi's per-working-directory session folder name (`--path-with-dashes--`). */
export function encodeSessionCwd(cwd: string): string {
  const resolved = path.resolve(cwd);
  return `--${resolved.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
}

export function graphSessionId(graphId: string): string {
  const safe = graphId.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
  return `graphchat-${safe || "graph"}`;
}

const structuralKinds = new Set(["branch", "continuation"]);

function structuralParent(graph: GraphDocument, nodeId: string): string | null {
  const edge = graph.edges.find(
    (candidate) => candidate.target === nodeId && structuralKinds.has(candidate.kind),
  );
  return edge?.source ?? null;
}

function orderForSync(graph: GraphDocument): GraphNode[] {
  // Parents must be appended before children so branch points exist.
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const ordered: GraphNode[] = [];
  const visited = new Set<string>();
  const visit = (node: GraphNode, trail: Set<string>) => {
    if (visited.has(node.id) || trail.has(node.id)) return;
    trail.add(node.id);
    const parentId = structuralParent(graph, node.id);
    const parent = parentId ? byId.get(parentId) : undefined;
    if (parent) visit(parent, trail);
    trail.delete(node.id);
    visited.add(node.id);
    ordered.push(node);
  };
  for (const node of [...graph.nodes].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    visit(node, new Set());
  }
  return ordered;
}

function isSyncable(node: GraphNode): boolean {
  if (node.status === "streaming") return false;
  if (node.status === "error" || node.status === "cancelled") return Boolean(node.prompt && node.content);
  return Boolean(node.prompt || node.content);
}

/**
 * Append graph nodes that have no Pi entry yet to the session tree, in
 * structural order, so the session mirrors the graph's branch structure.
 * Returns the entry ids that were assigned.
 */
export function syncGraphIntoSession(
  database: GraphDatabase,
  graph: GraphDocument,
  manager: SessionManager,
): Map<string, string> {
  const entryByNode = new Map<string, string>();
  for (const node of graph.nodes) {
    if (node.piEntryId && manager.getEntry(node.piEntryId)) entryByNode.set(node.id, node.piEntryId);
  }
  const assigned = new Map<string, string>();
  for (const node of orderForSync(graph)) {
    if (entryByNode.has(node.id) || !isSyncable(node)) continue;
    const parentId = structuralParent(graph, node.id);
    const parentEntry = parentId ? entryByNode.get(parentId) : undefined;
    if (parentEntry) manager.branch(parentEntry);
    else manager.resetLeaf();

    let entryId: string;
    if (node.prompt) {
      manager.appendMessage({ role: "user", content: node.prompt, timestamp: Date.parse(node.createdAt) });
      entryId = manager.appendMessage({
        role: "assistant",
        content: [{ type: "text", text: node.content }],
        api: "openai-completions",
        provider: node.provider ?? "graphchat",
        model: node.model ?? "imported",
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp: Date.parse(node.updatedAt),
      });
    } else {
      const heading = node.sourceUrl ? `# ${node.title}\n\nSource: ${node.sourceUrl}` : `# ${node.title}`;
      entryId = manager.appendCustomMessageEntry(
        "graphchat.node",
        `${heading}\n\n${node.content}`,
        true,
        { nodeId: node.id, kind: node.kind },
      );
    }
    entryByNode.set(node.id, entryId);
    assigned.set(node.id, entryId);
    database.setNodePiEntry(node.id, entryId);
  }
  return assigned;
}

export type GraphSessionHandle = {
  manager: SessionManager;
  path: string;
  created: boolean;
};

/**
 * Open the Pi session that backs a graph, creating it on first use, and make
 * sure every syncable node has an entry in it.
 */
export function openGraphSession(
  database: GraphDatabase,
  graph: GraphDocument,
  options: { cwd: string; sessionRoot: string },
): GraphSessionHandle {
  const sessionDir = path.join(options.sessionRoot, encodeSessionCwd(options.cwd));
  fs.mkdirSync(sessionDir, { recursive: true });
  let manager: SessionManager | null = null;
  let created = false;
  if (graph.graph.piSessionPath && fs.existsSync(graph.graph.piSessionPath)) {
    try {
      manager = SessionManager.open(graph.graph.piSessionPath, sessionDir, options.cwd);
    } catch {
      manager = null;
    }
  }
  if (!manager) {
    manager = SessionManager.create(options.cwd, sessionDir, { id: graphSessionId(graph.graph.id) });
    manager.appendSessionInfo(graph.graph.title);
    created = true;
    // Entry ids from a previous session file are meaningless in a new one.
    for (const node of graph.nodes) {
      if (node.piEntryId) database.setNodePiEntry(node.id, null);
    }
    graph = { ...graph, nodes: graph.nodes.map((node) => ({ ...node, piEntryId: null })) };
  }
  const sessionPath = manager.getSessionFile();
  if (!sessionPath) throw new Error("Pi session could not be persisted.");
  if (sessionPath !== graph.graph.piSessionPath) database.setGraphSession(graph.graph.id, sessionPath);
  syncGraphIntoSession(database, graph, manager);
  return { manager, path: sessionPath, created };
}
