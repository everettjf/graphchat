/**
 * Pi Graph Chat extension for the Pi coding agent.
 *
 * Talks to a running Pi Graph Chat server (default http://127.0.0.1:4317) and
 * gives the terminal agent the same graph tools the web app uses:
 *
 * - `graph_search` / `graph_get_node` tools, scoped to the graph that backs
 *   the current session when there is one, otherwise across every graph.
 * - `/graph` opens the current session in the web app; `/graph use <id>`
 *   binds a plain terminal session to a graph; `/graph status` shows the link.
 * - `/ref <node id | search words>` injects a graph node into the model
 *   context as a `graphchat.references` entry, the same mechanism the web app
 *   uses for cross-branch references.
 *
 * When the extension is loaded inside the Pi Graph Chat server itself
 * (GRAPHCHAT_EMBEDDED=1) it stays silent, because the server registers the
 * tools directly.
 */
import { spawn } from "node:child_process";
import { Type } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

export const DEFAULT_GRAPHCHAT_URL = "http://127.0.0.1:4317";
export const GRAPH_BINDING_ENTRY = "graphchat.graph";
export const REFERENCE_MESSAGE_TYPE = "graphchat.references";

type GraphMeta = { id: string; title: string; description: string };
type GraphNode = {
  id: string;
  graphId: string;
  title: string;
  prompt: string;
  content: string;
  summary: string;
  sourceUrl: string;
};

export type GraphChatExtensionOptions = {
  baseUrl?: string;
  fetch?: typeof fetch;
  openUrl?: (url: string) => void;
  env?: NodeJS.ProcessEnv;
};

function summarize(text: string, max = 160): string {
  const plain = text.replace(/[#*_`>\[\]]/g, "").replace(/\s+/g, " ").trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}

export function openInBrowser(url: string) {
  const command =
    process.platform === "win32"
      ? ["cmd.exe", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  const child = spawn(command[0] as string, command[1] as string[], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

export function formatReference(node: GraphNode, graph?: GraphMeta | null): string {
  const heading = graph ? `${graph.title} · ${node.title}` : node.title;
  const source = node.sourceUrl ? `\nSource: ${node.sourceUrl}` : "";
  return `[Node: ${node.id}] ${heading}${source}\n${node.content || node.summary}`;
}

export default function graphchatExtension(pi: ExtensionAPI, options: GraphChatExtensionOptions = {}) {
  const env = options.env ?? process.env;
  if (env.GRAPHCHAT_EMBEDDED === "1") return;
  const baseUrl = (options.baseUrl ?? env.GRAPHCHAT_URL ?? DEFAULT_GRAPHCHAT_URL).replace(/\/$/, "");
  const doFetch = options.fetch ?? fetch;
  const openUrl = options.openUrl ?? openInBrowser;
  const graphCache = new Map<string, GraphMeta | null>();

  async function request<T>(path: string): Promise<T> {
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`);
    } catch {
      throw new Error(`Pi Graph Chat is not reachable at ${baseUrl}. Start it with \`bun run launch\`.`);
    }
    if (response.status === 404) throw new NotFoundError(path);
    if (!response.ok) throw new Error(`Pi Graph Chat returned ${response.status} for ${path}`);
    return (await response.json()) as T;
  }

  /** Graph explicitly bound with `/graph use`, recorded on the active branch. */
  function boundGraphId(ctx: ExtensionContext): string | null {
    let bound: string | null = null;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "custom" && entry.customType === GRAPH_BINDING_ENTRY) {
        const data = entry.data as { graphId?: string | null } | undefined;
        bound = data?.graphId ?? null;
      }
    }
    return bound;
  }

  async function graphForSession(ctx: ExtensionContext): Promise<GraphMeta | null> {
    const bound = boundGraphId(ctx);
    if (bound) {
      try {
        return await request<GraphMeta>(`/api/graphs/${encodeURIComponent(bound)}`);
      } catch (error) {
        if (!(error instanceof NotFoundError)) throw error;
        return null;
      }
    }
    const sessionId = ctx.sessionManager.getSessionId();
    if (graphCache.has(sessionId)) return graphCache.get(sessionId) ?? null;
    try {
      const graph = await request<GraphMeta>(`/api/graphs/by-session/${encodeURIComponent(sessionId)}`);
      graphCache.set(sessionId, graph);
      return graph;
    } catch (error) {
      if (error instanceof NotFoundError) {
        graphCache.set(sessionId, null);
        return null;
      }
      throw error;
    }
  }

  async function search(ctx: ExtensionContext, query: string): Promise<Array<{ node: GraphNode; graph: GraphMeta | null }>> {
    const graph = await graphForSession(ctx);
    if (graph) {
      const { nodes } = await request<{ nodes: GraphNode[] }>(
        `/api/graphs/${encodeURIComponent(graph.id)}/search?q=${encodeURIComponent(query)}`,
      );
      return nodes.map((node) => ({ node, graph }));
    }
    const { results } = await request<{ results: Array<{ node: GraphNode; graph: GraphMeta | null }> }>(
      `/api/search?q=${encodeURIComponent(query)}`,
    );
    return results;
  }

  pi.registerTool({
    name: "graph_search",
    label: "Search knowledge graph",
    description:
      "Search the Pi Graph Chat knowledge graph for nodes related to a query. Scoped to the graph behind this session when there is one, otherwise across all graphs.",
    promptSnippet: "Search the Pi Graph Chat knowledge graph",
    parameters: Type.Object({
      query: Type.String({ description: "Concept, term, or question to search for" }),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const results = await search(ctx, String(params.query));
      const text =
        results.length === 0
          ? "No matching graph nodes were found."
          : results
              .map(
                ({ node, graph }) =>
                  `[Node: ${node.id}] ${graph ? `${graph.title} · ` : ""}${node.title}\n${node.summary || summarize(node.content)}`,
              )
              .join("\n\n");
      return { content: [{ type: "text", text }], details: { resultCount: results.length } };
    },
  });

  pi.registerTool({
    name: "graph_get_node",
    label: "Read graph node",
    description: "Read the full content of one Pi Graph Chat node by id.",
    promptSnippet: "Read one Pi Graph Chat node by id",
    parameters: Type.Object({
      nodeId: Type.String({ description: "Graph node id" }),
    }),
    execute: async (_toolCallId, params) => {
      const node = await request<GraphNode>(`/api/nodes/${encodeURIComponent(String(params.nodeId))}`);
      return {
        content: [{ type: "text", text: `[Node: ${node.id}] ${node.title}\n\n${node.content}` }],
        details: { nodeId: node.id },
      };
    },
  });

  pi.registerCommand("graph", {
    description: "Open this session in Pi Graph Chat, or `use <graph id>` / `status`",
    getArgumentCompletions: (prefix) => {
      const options = ["use", "status", "unbind"].filter((option) => option.startsWith(prefix));
      return options.length > 0 ? options.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const [verb, ...rest] = args.trim().split(/\s+/).filter(Boolean);
      if (verb === "use") {
        const graphId = rest[0];
        if (!graphId) {
          ctx.ui.notify("Usage: /graph use <graph id>", "warning");
          return;
        }
        try {
          const graph = await request<GraphMeta>(`/api/graphs/${encodeURIComponent(graphId)}`);
          pi.appendEntry(GRAPH_BINDING_ENTRY, { graphId: graph.id });
          ctx.ui.notify(`Graph tools now use “${graph.title}”.`, "info");
        } catch (error) {
          ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
        }
        return;
      }
      if (verb === "unbind") {
        pi.appendEntry(GRAPH_BINDING_ENTRY, { graphId: null });
        ctx.ui.notify("Graph tools now search every graph.", "info");
        return;
      }
      let graph: GraphMeta | null = null;
      try {
        graph = await graphForSession(ctx);
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
        return;
      }
      if (verb === "status") {
        ctx.ui.notify(
          graph
            ? `This session is linked to graph “${graph.title}” (${graph.id}).`
            : "This session is not linked to a graph; graph tools search every graph.",
          "info",
        );
        return;
      }
      const url = graph
        ? `${baseUrl}/?graph=${encodeURIComponent(graph.id)}`
        : `${baseUrl}/?pi=${encodeURIComponent(ctx.sessionManager.getSessionId())}`;
      openUrl(url);
      ctx.ui.notify(`Opened ${url}`, "info");
    },
  });

  pi.registerCommand("ref", {
    description: "Add a Pi Graph Chat node to the context: /ref <node id | search words>",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const query = args.trim();
      if (!query) {
        ctx.ui.notify("Usage: /ref <node id | search words>", "warning");
        return;
      }
      try {
        let picked: { node: GraphNode; graph: GraphMeta | null } | null = null;
        if (/^[A-Za-z0-9_-]{6,}$/.test(query)) {
          try {
            const node = await request<GraphNode>(`/api/nodes/${encodeURIComponent(query)}`);
            picked = { node, graph: null };
          } catch (error) {
            if (!(error instanceof NotFoundError)) throw error;
          }
        }
        if (!picked) {
          const results = await search(ctx, query);
          if (results.length === 0) {
            ctx.ui.notify(`No graph node matches “${query}”.`, "warning");
            return;
          }
          if (results.length > 1 && ctx.hasUI) {
            const labels = results.map(
              ({ node, graph }) => `${graph ? `${graph.title} · ` : ""}${node.title} (${node.id})`,
            );
            const choice = await ctx.ui.select("Reference which node?", labels);
            if (!choice) return;
            picked = results[labels.indexOf(choice)] ?? results[0]!;
          } else {
            picked = results[0]!;
          }
        }
        pi.sendMessage(
          {
            customType: REFERENCE_MESSAGE_TYPE,
            content: formatReference(picked.node, picked.graph),
            display: true,
            details: { nodeIds: [picked.node.id], source: "pi-extension" },
          },
          { triggerTurn: false },
        );
        ctx.ui.notify(`Referenced “${picked.node.title}”.`, "info");
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });
}

class NotFoundError extends Error {
  constructor(path: string) {
    super(`Not found: ${path}`);
    this.name = "NotFoundError";
  }
}
