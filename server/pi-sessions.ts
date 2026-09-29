import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseSessionEntries,
  SessionManager,
  type FileEntry,
  type SessionEntry,
  type SessionTreeNode,
} from "@earendil-works/pi-coding-agent";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type {
  PiSessionSummary,
  PiSessionTree,
  PiToolCall,
  PiTurn,
  PiTurnKind,
} from "../shared/types.js";

/**
 * Resolve the directory that holds Pi coding-agent session files.
 *
 * Mirrors Pi's own precedence: an explicit session directory wins, then an
 * explicit agent directory, then `~/.pi/agent/sessions`.
 */
export function resolvePiSessionDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.PI_CODING_AGENT_SESSION_DIR) return path.resolve(env.PI_CODING_AGENT_SESSION_DIR);
  if (env.PI_CODING_AGENT_DIR) return path.join(path.resolve(env.PI_CODING_AGENT_DIR), "sessions");
  return path.join(os.homedir(), ".pi", "agent", "sessions");
}

type MessageContent = string | Array<{ type: string; text?: string }>;

function contentText(content: MessageContent | undefined): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content
    .map((block) => (block.type === "text" ? block.text ?? "" : block.type === "image" ? "[image]" : ""))
    .filter(Boolean)
    .join("\n");
}

function previewTitle(text: string, fallback: string): string {
  const plain = text.replace(/\s+/g, " ").trim();
  if (!plain) return fallback;
  return plain.length > 80 ? `${plain.slice(0, 77)}…` : plain;
}

const TURN_STARTERS = new Set<SessionEntry["type"]>([
  "compaction",
  "branch_summary",
  "custom_message",
]);

function startsTurn(entry: SessionEntry): boolean {
  if (entry.type === "message") return entry.message.role === "user";
  return TURN_STARTERS.has(entry.type);
}

type TurnDraft = PiTurn & { hasContent: boolean };

function newTurn(entry: SessionEntry, parentId: string | null): TurnDraft {
  return {
    id: entry.id,
    parentId,
    kind: "other",
    title: "",
    timestamp: entry.timestamp,
    prompt: "",
    response: "",
    thinking: "",
    toolCalls: [],
    provider: null,
    model: null,
    label: null,
    entryIds: [],
    onActivePath: false,
    isLeaf: false,
    hasContent: false,
  };
}

function appendText(current: string, next: string): string {
  if (!next) return current;
  return current ? `${current}\n\n${next}` : next;
}

function absorbMessage(turn: TurnDraft, message: AgentMessage) {
  switch (message.role) {
    case "user": {
      const text = contentText(message.content as MessageContent);
      if (!turn.hasContent) turn.kind = "user";
      turn.prompt = appendText(turn.prompt, text);
      turn.hasContent = true;
      break;
    }
    case "assistant": {
      if (!turn.hasContent) turn.kind = "assistant";
      turn.hasContent = true;
      turn.provider = message.provider ?? turn.provider;
      turn.model = message.model ?? turn.model;
      for (const block of message.content) {
        if (block.type === "text") turn.response = appendText(turn.response, block.text);
        else if (block.type === "thinking") turn.thinking = appendText(turn.thinking, block.thinking);
        else if (block.type === "toolCall") {
          turn.toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: JSON.stringify(block.arguments ?? {}, null, 2),
            result: "",
            isError: false,
          });
        }
      }
      if (message.errorMessage) {
        turn.response = appendText(turn.response, `Error: ${message.errorMessage}`);
      }
      break;
    }
    case "toolResult": {
      turn.hasContent = true;
      const result = contentText(message.content as MessageContent);
      const call = turn.toolCalls.find((candidate) => candidate.id === message.toolCallId);
      if (call) {
        call.result = result;
        call.isError = message.isError;
      } else {
        turn.toolCalls.push({
          id: message.toolCallId,
          name: message.toolName,
          arguments: "",
          result,
          isError: message.isError,
        });
      }
      break;
    }
    case "bashExecution": {
      turn.hasContent = true;
      turn.toolCalls.push({
        id: `bash-${message.timestamp}`,
        name: "bash",
        arguments: message.command,
        result: message.output,
        isError: message.exitCode !== undefined && message.exitCode !== 0,
      });
      break;
    }
    case "custom": {
      if (!turn.hasContent) turn.kind = "custom_message";
      turn.hasContent = true;
      turn.prompt = appendText(turn.prompt, contentText(message.content as MessageContent));
      break;
    }
    default:
      break;
  }
}

function absorbEntry(turn: TurnDraft, node: SessionTreeNode) {
  const entry = node.entry;
  turn.entryIds.push(entry.id);
  if (node.label && !turn.label) turn.label = node.label;
  switch (entry.type) {
    case "message":
      absorbMessage(turn, entry.message);
      break;
    case "compaction":
      if (!turn.hasContent) turn.kind = "compaction";
      turn.hasContent = true;
      turn.response = appendText(turn.response, entry.summary);
      break;
    case "branch_summary":
      if (!turn.hasContent) turn.kind = "branch_summary";
      turn.hasContent = true;
      turn.response = appendText(turn.response, entry.summary);
      break;
    case "custom_message":
      if (!turn.hasContent) turn.kind = "custom_message";
      turn.hasContent = true;
      turn.prompt = appendText(turn.prompt, contentText(entry.content as MessageContent));
      break;
    case "model_change":
      turn.provider = entry.provider;
      turn.model = entry.modelId;
      break;
    default:
      break;
  }
}

const KIND_TITLES: Record<PiTurnKind, string> = {
  user: "Untitled prompt",
  assistant: "Assistant response",
  compaction: "Compaction summary",
  branch_summary: "Branch summary",
  custom_message: "Extension message",
  other: "Session state",
};

function finishTurn(turn: TurnDraft): PiTurn {
  const { hasContent: _hasContent, ...rest } = turn;
  const source = turn.kind === "user" || turn.kind === "custom_message" ? turn.prompt : turn.response;
  return { ...rest, title: previewTitle(source, KIND_TITLES[turn.kind]) };
}

/**
 * Collapse a Pi session tree into "turns": one node per user prompt plus the
 * assistant work that follows it, until the next prompt or a branch point.
 * Branch points always end a turn so every fork stays visible.
 */
export function buildTurns(
  tree: SessionTreeNode[],
  activeEntryIds: Set<string>,
  leafEntryId: string | null,
): { turns: PiTurn[]; leafTurnId: string | null } {
  const turns: PiTurn[] = [];
  let leafTurnId: string | null = null;
  const stack: Array<{ node: SessionTreeNode; parentTurnId: string | null }> = [];
  for (let index = tree.length - 1; index >= 0; index -= 1) {
    stack.push({ node: tree[index]!, parentTurnId: null });
  }
  while (stack.length > 0) {
    const { node, parentTurnId } = stack.pop()!;
    const turn = newTurn(node.entry, parentTurnId);
    let cursor = node;
    while (true) {
      absorbEntry(turn, cursor);
      if (activeEntryIds.has(cursor.entry.id)) turn.onActivePath = true;
      if (cursor.entry.id === leafEntryId) turn.isLeaf = true;
      const next = cursor.children.length === 1 ? cursor.children[0]! : null;
      if (next && (!startsTurn(next.entry) || !turn.hasContent)) {
        cursor = next;
        continue;
      }
      break;
    }
    const finished = finishTurn(turn);
    turns.push(finished);
    if (finished.isLeaf) leafTurnId = finished.id;
    for (let index = cursor.children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: cursor.children[index]!, parentTurnId: finished.id });
    }
  }
  return { turns, leafTurnId };
}

type CacheEntry = {
  mtimeMs: number;
  size: number;
  summary: PiSessionSummary;
  /** Full turn tree; kept only for recently opened sessions to bound memory. */
  tree: PiSessionTree | null;
};

/** How many parsed session trees stay in memory; summaries are kept for all. */
const TREE_CACHE_LIMIT = 8;

function listSessionFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (directory: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(full);
    }
  };
  walk(root);
  return files;
}

/**
 * Read-only index over Pi session files. Files are parsed lazily and cached by
 * mtime and size, so polling the list is cheap even with hundreds of sessions.
 */
export class PiSessionIndex {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly recentTrees: string[] = [];

  constructor(readonly sessionDir: string) {}

  list(): PiSessionSummary[] {
    const files = listSessionFiles(this.sessionDir);
    const seen = new Set<string>();
    const summaries: PiSessionSummary[] = [];
    for (const file of files) {
      const entry = this.load(file);
      if (!entry) continue;
      seen.add(file);
      summaries.push(entry.summary);
    }
    for (const cached of [...this.cache.keys()]) {
      if (!seen.has(cached)) this.cache.delete(cached);
    }
    return summaries.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }

  get(id: string): PiSessionTree | null {
    let cached = [...this.cache.values()].find((entry) => entry.summary.id === id);
    if (!cached) {
      this.list();
      cached = [...this.cache.values()].find((entry) => entry.summary.id === id);
    }
    if (!cached) return null;
    const fresh = this.load(cached.summary.path, true);
    return fresh?.tree ?? null;
  }

  private rememberTree(file: string) {
    const index = this.recentTrees.indexOf(file);
    if (index >= 0) this.recentTrees.splice(index, 1);
    this.recentTrees.push(file);
    while (this.recentTrees.length > TREE_CACHE_LIMIT) {
      const evicted = this.recentTrees.shift()!;
      const entry = this.cache.get(evicted);
      if (entry) entry.tree = null;
    }
  }

  private load(file: string, withTree = false): CacheEntry | null {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file);
    } catch {
      this.cache.delete(file);
      return null;
    }
    const cached = this.cache.get(file);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      if (!withTree || cached.tree) {
        if (withTree) this.rememberTree(file);
        return cached;
      }
    }
    let entries: FileEntry[];
    try {
      entries = parseSessionEntries(fs.readFileSync(file, "utf8"));
    } catch {
      this.cache.delete(file);
      return null;
    }
    const header = entries[0];
    if (!header || header.type !== "session") {
      this.cache.delete(file);
      return null;
    }
    const manager = SessionManager.inMemory(header.cwd, { id: header.id }, entries);
    const leafId = manager.getLeafId();
    const activeIds = new Set(manager.getBranch().map((entry) => entry.id));
    const { turns, leafTurnId } = buildTurns(manager.getTree(), activeIds, leafId);
    const firstUserTurn = turns.find((turn) => turn.kind === "user");
    const lastModel = [...turns].reverse().find((turn) => turn.model);
    const summary: PiSessionSummary = {
      id: header.id,
      path: file,
      cwd: header.cwd,
      name: manager.getSessionName() ?? null,
      parentSessionPath: header.parentSession ?? null,
      createdAt: header.timestamp,
      modifiedAt: stat.mtime.toISOString(),
      turnCount: turns.filter((turn) => turn.kind === "user").length,
      firstPrompt: firstUserTurn?.title ?? "",
      provider: lastModel?.provider ?? null,
      model: lastModel?.model ?? null,
    };
    const next: CacheEntry = {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      summary,
      tree: withTree ? { session: summary, turns, leafTurnId } : null,
    };
    this.cache.set(file, next);
    if (withTree) this.rememberTree(file);
    return next;
  }
}
