import { z } from "zod";

export const nodeKinds = ["question", "answer", "concept", "summary", "note"] as const;
export const edgeKinds = ["branch", "reference", "supports", "contradicts"] as const;
export const nodeStatuses = ["idle", "streaming", "complete", "error"] as const;

export const graphNodeSchema = z.object({
  id: z.string(),
  graphId: z.string(),
  kind: z.enum(nodeKinds),
  title: z.string(),
  prompt: z.string().default(""),
  content: z.string().default(""),
  summary: z.string().default(""),
  selectedText: z.string().nullable().default(null),
  x: z.number(),
  y: z.number(),
  status: z.enum(nodeStatuses),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const graphEdgeSchema = z.object({
  id: z.string(),
  graphId: z.string(),
  source: z.string(),
  target: z.string(),
  kind: z.enum(edgeKinds),
  label: z.string().default(""),
  includeInContext: z.boolean().default(true),
  createdAt: z.string(),
});

export const graphMetaSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const graphDocumentSchema = z.object({
  graph: graphMetaSchema,
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
});

export const providerSettingsSchema = z.object({
  provider: z.enum(["demo", "openai-codex", "openai", "openrouter", "ollama", "custom"]),
  model: z.string().min(1),
  baseUrl: z.string().optional().default(""),
  hasApiKey: z.boolean().default(false),
});

export const createNodeSchema = z.object({
  graphId: z.string(),
  parentNodeId: z.string().nullable().optional(),
  referenceNodeIds: z.array(z.string()).default([]),
  kind: z.enum(nodeKinds).default("question"),
  title: z.string().min(1).max(120),
  prompt: z.string().default(""),
  content: z.string().default(""),
  summary: z.string().default(""),
  selectedText: z.string().nullable().default(null),
  x: z.number(),
  y: z.number(),
});

export const updateNodeSchema = graphNodeSchema
  .pick({
    title: true,
    prompt: true,
    content: true,
    summary: true,
    x: true,
    y: true,
    status: true,
  })
  .partial();

export const runRequestSchema = z.object({
  graphId: z.string(),
  parentNodeId: z.string().nullable(),
  referenceNodeIds: z.array(z.string()).default([]),
  prompt: z.string().min(1).max(20_000),
  selectedText: z.string().nullable().default(null),
  position: z.object({ x: z.number(), y: z.number() }),
  mode: z.enum(["answer", "explore", "synthesize"]).default("answer"),
});

export type GraphNode = z.infer<typeof graphNodeSchema>;
export type GraphEdge = z.infer<typeof graphEdgeSchema>;
export type GraphMeta = z.infer<typeof graphMetaSchema>;
export type GraphDocument = z.infer<typeof graphDocumentSchema>;
export type ProviderSettings = z.infer<typeof providerSettingsSchema>;
export type CreateNodeInput = z.infer<typeof createNodeSchema>;
export type UpdateNodeInput = z.infer<typeof updateNodeSchema>;
export type RunRequest = z.infer<typeof runRequestSchema>;

export type ContextItem = {
  nodeId: string;
  title: string;
  reason: "main-path" | "reference" | "selection";
  detail: "full" | "summary" | "selection";
  content: string;
  estimatedTokens: number;
};

export type ContextSnapshot = {
  items: ContextItem[];
  estimatedTokens: number;
  omittedNodeIds: string[];
};

export type RunStreamEvent =
  | { type: "run_started"; node: GraphNode; context: ContextSnapshot }
  | { type: "text_delta"; delta: string }
  | { type: "tool_started"; tool: string; label: string }
  | { type: "tool_finished"; tool: string; summary: string }
  | { type: "run_finished"; node: GraphNode }
  | { type: "run_failed"; message: string };

export type CodexAuthStatus =
  | { state: "signed_out" }
  | { state: "starting" }
  | {
      state: "pending";
      userCode: string;
      verificationUri: string;
      expiresAt: string;
      message: string;
    }
  | { state: "authenticated"; source: string }
  | { state: "error"; message: string };
