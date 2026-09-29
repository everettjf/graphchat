import fs from "node:fs";
import path from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { GraphDocument, GraphNode } from "../shared/types.js";
import type { GraphDatabase } from "./database.js";
import { buildTurns } from "./pi-sessions.js";

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
  if (!created && importSessionTurnsIntoGraph(database, graph, manager).length > 0) {
    graph = database.getGraph(graph.graph.id) ?? graph;
  }
  syncGraphIntoSession(database, graph, manager);
  return { manager, path: sessionPath, created };
}

// ---------------------------------------------------------------------------
// Session → graph: turns added in the terminal become graph nodes
// ---------------------------------------------------------------------------

function summarizeText(content: string): string {
  const plain = content.replace(/[#*_`>\[\]]/g, "").replace(/\s+/g, " ").trim();
  return plain.length > 150 ? `${plain.slice(0, 147)}…` : plain;
}

/**
 * Create graph nodes for prompt turns that exist in the session but have no
 * node yet, typically because the user continued the graph's session in the
 * terminal with `pi --session`. Idempotent: turns already mapped to a node
 * are skipped, and a turn without an answer yet is left for a later sync.
 */
export function importSessionTurnsIntoGraph(
  database: GraphDatabase,
  graph: GraphDocument,
  manager: SessionManager,
): GraphNode[] {
  const nodeByEntry = new Map<string, GraphNode>();
  for (const node of graph.nodes) {
    if (node.piEntryId) nodeByEntry.set(node.piEntryId, node);
  }
  const ignored = database.listIgnoredPiEntries(graph.graph.id);
  const activeIds = new Set(manager.getBranch().map((entry) => entry.id));
  const { turns } = buildTurns(manager.getTree(), activeIds, manager.getLeafId());
  const lastAssistantEntry = (turn: (typeof turns)[number]) =>
    [...turn.entryIds].reverse().find((id) => {
      const entry = manager.getEntry(id);
      return entry?.type === "message" && entry.message.role === "assistant";
    });
  const nodeByTurn = new Map<string, GraphNode>();
  for (const turn of turns) {
    const existing = turn.entryIds.map((id) => nodeByEntry.get(id)).find(Boolean);
    if (existing) nodeByTurn.set(turn.id, existing);
  }
  // Nodes that lost their mapping (older data, interrupted runs) are linked back
  // to the turn with the same prompt instead of being imported a second time.
  const unmapped = graph.nodes.filter((node) => !node.piEntryId && node.prompt);
  for (const turn of turns) {
    if (nodeByTurn.has(turn.id) || turn.kind !== "user") continue;
    const index = unmapped.findIndex((node) => node.prompt === turn.prompt);
    if (index < 0) continue;
    const [node] = unmapped.splice(index, 1);
    const entryId = lastAssistantEntry(turn) ?? turn.entryIds.at(-1) ?? null;
    database.setNodePiEntry(node!.id, entryId);
    nodeByTurn.set(turn.id, { ...node!, piEntryId: entryId });
  }

  const created: GraphNode[] = [];
  // Mirror the composer's placement: alternate lanes under the parent, or a new
  // root lane, so imported nodes do not land on top of existing cards.
  const structural = (edge: GraphDocument["edges"][number]) =>
    edge.kind === "branch" || edge.kind === "continuation";
  const childCount = new Map<string, number>();
  for (const edge of graph.edges.filter(structural)) {
    childCount.set(edge.source, (childCount.get(edge.source) ?? 0) + 1);
  }
  const incoming = new Set(graph.edges.filter(structural).map((edge) => edge.target));
  let rootCount = graph.nodes.filter((node) => !incoming.has(node.id)).length;
  const placeUnder = (parent: GraphNode | null) => {
    if (!parent) {
      const position = { x: 120 + rootCount * 376, y: 100 };
      rootCount += 1;
      return position;
    }
    const count = childCount.get(parent.id) ?? 0;
    childCount.set(parent.id, count + 1);
    const lane = count === 0 ? 0 : Math.ceil(count / 2) * (count % 2 === 1 ? -1 : 1);
    return { x: parent.x + lane * 376, y: parent.y + 236 };
  };
  for (const turn of turns) {
    if (nodeByTurn.has(turn.id) || turn.kind !== "user" || !turn.response.trim()) continue;
    // Deleted or undone nodes: their turns stay in the session but must not return.
    if (turn.entryIds.some((id) => ignored.has(id))) continue;
    // Interrupted or failed answers are not knowledge; leave them in the session only.
    const answerEntry = lastAssistantEntry(turn);
    const answer = answerEntry ? manager.getEntry(answerEntry) : undefined;
    if (
      answer?.type === "message" &&
      answer.message.role === "assistant" &&
      answer.message.stopReason !== "stop" &&
      answer.message.stopReason !== "toolUse"
    ) {
      continue;
    }
    let parent: GraphNode | null = null;
    for (let cursor = turn.parentId; cursor; ) {
      const candidate = nodeByTurn.get(cursor);
      if (candidate) {
        parent = candidate;
        break;
      }
      cursor = turns.find((other) => other.id === cursor)?.parentId ?? null;
    }
    const position = placeUnder(parent);
    const node = database.createNode(
      {
        graphId: graph.graph.id,
        parentNodeId: parent?.id ?? null,
        parentEdgeKind: "continuation",
        referenceNodeIds: [],
        kind: "answer",
        title: turn.title,
        prompt: turn.prompt,
        content: turn.response,
        summary: summarizeText(turn.response),
        tags: ["pi-terminal"],
        selectedText: null,
        x: position.x,
        y: position.y,
      },
      turn.provider,
      turn.model,
    );
    database.setNodePiEntry(node.id, answerEntry ?? turn.entryIds.at(-1) ?? null);
    const stored = database.getNode(node.id) ?? node;
    nodeByTurn.set(turn.id, stored);
    created.push(stored);
  }
  return created;
}

/**
 * Pulls terminal turns into graphs when their session files change. Cheap to
 * call on every graph read: it only parses a session whose mtime moved.
 */
export class GraphSessionSync {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly database: GraphDatabase,
    private readonly isBusy: (graphId: string) => boolean = () => false,
  ) {}

  /** Returns the refreshed graph when new nodes were imported, else the input. */
  sync(graph: GraphDocument): GraphDocument {
    const sessionPath = graph.graph.piSessionPath;
    if (!sessionPath || this.isBusy(graph.graph.id)) return graph;
    let mtimeMs: number;
    try {
      mtimeMs = fs.statSync(sessionPath).mtimeMs;
    } catch {
      return graph;
    }
    if (this.seen.get(sessionPath) === mtimeMs) return graph;
    let manager: SessionManager;
    try {
      manager = SessionManager.open(sessionPath, undefined, graph.graph.projectDir ?? undefined);
    } catch {
      this.seen.set(sessionPath, mtimeMs);
      return graph;
    }
    const created = importSessionTurnsIntoGraph(this.database, graph, manager);
    this.seen.set(sessionPath, mtimeMs);
    return created.length > 0 ? (this.database.getGraph(graph.graph.id) ?? graph) : graph;
  }

  /** Forget a file so the next read re-imports; used after the app itself wrote the session. */
  invalidate(sessionPath: string | null) {
    if (sessionPath) this.seen.delete(sessionPath);
  }
}
