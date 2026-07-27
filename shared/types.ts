import { z } from "zod";

export const nodeKinds = ["question", "answer", "concept", "summary", "note"] as const;
export const edgeKinds = ["branch", "reference", "supports", "contradicts"] as const;
export const nodeStatuses = ["idle", "streaming", "complete", "cancelled", "error"] as const;
export const knowledgeStatuses = ["exploring", "verified", "conclusion", "outdated"] as const;
export const masteryLevels = ["new", "learning", "mastered"] as const;

export const contextItemSchema = z.object({
  nodeId: z.string(),
  title: z.string(),
  reason: z.enum(["main-path", "reference", "selection"]),
  detail: z.enum(["full", "summary", "selection"]),
  content: z.string(),
  estimatedTokens: z.number(),
});

export const contextSnapshotSchema = z.object({
  items: z.array(contextItemSchema),
  estimatedTokens: z.number(),
  omittedNodeIds: z.array(z.string()),
});

export const graphNodeSchema = z.object({
  id: z.string(),
  graphId: z.string(),
  kind: z.enum(nodeKinds),
  title: z.string(),
  prompt: z.string().default(""),
  content: z.string().default(""),
  summary: z.string().default(""),
  tags: z.array(z.string()).default([]),
  knowledgeStatus: z.enum(knowledgeStatuses).default("exploring"),
  mastery: z.enum(masteryLevels).default("new"),
  sourceUrl: z.string().default(""),
  credibility: z.number().int().min(1).max(5).nullable().default(null),
  rating: z.number().int().min(-1).max(1).default(0),
  contextSnapshot: contextSnapshotSchema.nullable().default(null),
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
  archivedAt: z.string().nullable().default(null),
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
  tags: z.array(z.string()).default([]),
  knowledgeStatus: z.enum(knowledgeStatuses).default("exploring"),
  mastery: z.enum(masteryLevels).default("new"),
  sourceUrl: z.string().default(""),
  credibility: z.number().int().min(1).max(5).nullable().default(null),
  rating: z.number().int().min(-1).max(1).default(0),
  contextSnapshot: contextSnapshotSchema.nullable().default(null),
  selectedText: z.string().nullable().default(null),
  x: z.number(),
  y: z.number(),
});

export const updateNodeSchema = z.object({
  title: z.string(),
  prompt: z.string(),
  content: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
  knowledgeStatus: z.enum(knowledgeStatuses),
  mastery: z.enum(masteryLevels),
  sourceUrl: z.string(),
  credibility: z.number().int().min(1).max(5).nullable(),
  rating: z.number().int().min(-1).max(1),
  x: z.number(),
  y: z.number(),
  status: z.enum(nodeStatuses),
}).partial();

export const createGraphSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(300).default(""),
});

export const updateGraphSchema = createGraphSchema.partial().refine(
  (value) => value.title !== undefined || value.description !== undefined,
  "At least one graph field is required",
);

export const runRequestSchema = z.object({
  graphId: z.string(),
  parentNodeId: z.string().nullable(),
  referenceNodeIds: z.array(z.string()).default([]),
  prompt: z.string().min(1).max(20_000),
  selectedText: z.string().nullable().default(null),
  position: z.object({ x: z.number(), y: z.number() }),
  mode: z.enum(["answer", "explore", "synthesize"]).default("answer"),
  locale: z.enum(["en", "zh"]).default("en"),
});

export const importTextSchema = z.object({
  graphId: z.string(),
  title: z.string().trim().min(1).max(120),
  content: z.string().min(1).max(1_000_000),
  sourceUrl: z.string().trim().max(2_000).default(""),
  format: z.enum(["markdown", "text"]).default("markdown"),
});

export const productEventContextSchema = z.object({
  sessionId: z.string().trim().min(1).max(128),
  appVersion: z.string().trim().min(1).max(32),
});

export const graphBackupSchema = z.object({
  version: z.number().int().min(1),
  graphs: z.array(graphDocumentSchema),
});

export type GraphNode = z.infer<typeof graphNodeSchema>;
export type GraphEdge = z.infer<typeof graphEdgeSchema>;
export type GraphMeta = z.infer<typeof graphMetaSchema>;
export type GraphDocument = z.infer<typeof graphDocumentSchema>;
export type ProviderSettings = z.infer<typeof providerSettingsSchema>;
export type CreateNodeInput = z.input<typeof createNodeSchema>;
export type UpdateNodeInput = z.infer<typeof updateNodeSchema>;
export type CreateGraphInput = z.infer<typeof createGraphSchema>;
export type UpdateGraphInput = z.infer<typeof updateGraphSchema>;
export type RunRequest = z.infer<typeof runRequestSchema>;
export type ImportTextInput = z.infer<typeof importTextSchema>;
export type GraphBackup = z.infer<typeof graphBackupSchema>;

export type MetadataSuggestion = {
  tags: string[];
  summary: string;
  knowledgeStatus: GraphNode["knowledgeStatus"];
};

export type StudyCard = {
  nodeId: string;
  kind: "recall" | "concept" | "counterexample";
  question: string;
  answer: string;
  mastery: GraphNode["mastery"];
  sourceUrl: string;
};

export type GraphMetrics = {
  nodes: number;
  edges: number;
  branches: number;
  references: number;
  conclusions: number;
  verified: number;
  mastered: number;
  reusableConclusions: number;
  firstBranchAt: string | null;
  firstSynthesisAt: string | null;
  lastOpenedAt: string | null;
  activityLast7Days: number;
  evidenceCoverage: number;
  ratedAnswers: number;
  helpfulRate: number | null;
};

export type ProductValidationGraph = {
  graphId: string;
  createdAt: string;
  eligible: boolean;
  activated: boolean;
  activationAt: string | null;
  timeToFirstBranchMinutes: number | null;
  timeToFirstSynthesisMinutes: number | null;
  distinctSessions: number;
  returnedAfter7Days: boolean;
  conclusions: number;
  evidenceBackedConclusions: number;
  evidenceCoverage: number;
  completedRuns: number;
  cancelledRuns: number;
  failedRuns: number;
  helpfulRate: number | null;
};

export type ProductValidationReport = {
  schemaVersion: 1;
  appVersion: string;
  generatedAt: string;
  privacy: "local-only; excludes prompts, content, titles, source URLs, and credentials";
  definitions: {
    eligibleGraph: string;
    activation: string;
    evidenceBackedConclusion: string;
    returnedAfter7Days: string;
  };
  summary: {
    eligibleGraphs: number;
    activatedGraphs: number;
    activationRate: number;
    medianTimeToFirstSynthesisMinutes: number | null;
    returnedAfter7DaysGraphs: number;
    sevenDayReturnRate: number;
    conclusions: number;
    evidenceBackedConclusions: number;
    evidenceCoverage: number;
    completedRuns: number;
    cancelledRuns: number;
    failedRuns: number;
  };
  graphs: ProductValidationGraph[];
};

export type ContextItem = z.infer<typeof contextItemSchema>;
export type ContextSnapshot = z.infer<typeof contextSnapshotSchema>;

export type RunStreamEvent =
  | {
      type: "run_started";
      runId: string;
      nodeId: string;
      node: GraphNode;
      context: ContextSnapshot;
    }
  | { type: "text_delta"; runId: string; nodeId: string; delta: string }
  | {
      type: "tool_started";
      runId: string;
      nodeId: string;
      tool: string;
      label: string;
    }
  | {
      type: "tool_finished";
      runId: string;
      nodeId: string;
      tool: string;
      summary: string;
    }
  | { type: "run_finished"; runId: string; nodeId: string; node: GraphNode }
  | {
      type: "run_cancelled";
      runId: string;
      nodeId: string;
      message: string;
      node?: GraphNode;
    }
  | {
      type: "run_failed";
      runId: string | null;
      nodeId: string | null;
      message: string;
      node?: GraphNode;
    };

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
