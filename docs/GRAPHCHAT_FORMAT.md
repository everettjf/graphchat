# Graph Chat interchange format

Graph Chat exports a versioned JSON document from `GET /api/export`.
Version 2 is the first public knowledge-asset format.

```ts
type GraphChatBackup = {
  version: 2;
  exportedAt: string;
  graphs: Array<{
    graph: {
      id: string;
      title: string;
      description: string;
      createdAt: string;
      updatedAt: string;
      archivedAt: string | null;
    };
    nodes: GraphNode[];
    edges: GraphEdge[];
  }>;
};

type GraphNode = {
  id: string;
  graphId: string;
  kind: "question" | "answer" | "concept" | "summary" | "note";
  title: string;
  prompt: string;
  content: string;
  summary: string;
  tags: string[];
  knowledgeStatus: "exploring" | "verified" | "conclusion" | "outdated";
  mastery: "new" | "learning" | "mastered";
  sourceUrl: string;
  credibility: 1 | 2 | 3 | 4 | 5 | null;
  rating: -1 | 0 | 1;
  contextSnapshot: {
    items: Array<{
      nodeId: string;
      title: string;
      reason: "main-path" | "reference" | "selection";
      detail: "full" | "summary" | "selection";
      content: string;
      estimatedTokens: number;
    }>;
    estimatedTokens: number;
    omittedNodeIds: string[];
  } | null;
  selectedText: string | null;
  x: number;
  y: number;
  status: "idle" | "streaming" | "complete" | "cancelled" | "error";
  provider: string | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
};

type GraphEdge = {
  id: string;
  graphId: string;
  source: string;
  target: string;
  kind: "branch" | "reference" | "supports" | "contradicts";
  label: string;
  includeInContext: boolean;
  createdAt: string;
};
```

Restore is intentionally non-destructive. `POST /api/restore` accepts a backup
and creates new graphs with `(restored)` appended to their titles. Node and edge
IDs are remapped so restored material cannot overwrite existing data.

Credentials are not part of this format. API keys are process-only and ChatGPT
OAuth credentials remain in the private local credential file.
