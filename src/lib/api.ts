import type {
  CodexAuthStatus,
  CreateGraphInput,
  GraphDocument,
  GraphBackup,
  GraphMeta,
  GraphMetrics,
  GraphNode,
  ImportTextInput,
  MetadataSuggestion,
  ProviderSettings,
  ProductValidationReport,
  RunRequest,
  RunStreamEvent,
  StudyCard,
  UpdateGraphInput,
  UpdateNodeInput,
  UpdateGraphLayoutInput,
} from "@shared/types";
import { APP_VERSION } from "@shared/version";

function productSessionId() {
  const key = "graphchat-product-session";
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const created = window.crypto.randomUUID();
  window.sessionStorage.setItem(key, created);
  return created;
}

type BootstrapData = {
  graphs: GraphMeta[];
  archivedGraphs: GraphMeta[];
  activeGraph: GraphDocument | null;
  settings: ProviderSettings;
};

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(error?.message || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  bootstrap: () => fetch("/api/bootstrap").then((response) => parseResponse<BootstrapData>(response)),
  graph: (id: string) => fetch(`/api/graphs/${id}`).then((response) => parseResponse<GraphDocument>(response)),
  createGraph: (input: CreateGraphInput) =>
    fetch("/api/graphs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((response) => parseResponse<GraphDocument>(response)),
  updateGraph: (id: string, input: UpdateGraphInput) =>
    fetch(`/api/graphs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((response) => parseResponse<GraphMeta>(response)),
  archiveGraph: (id: string) =>
    fetch(`/api/graphs/${id}`, { method: "DELETE" }).then((response) =>
      parseResponse<GraphMeta>(response),
    ),
  restoreGraph: (id: string) =>
    fetch(`/api/graphs/${id}/restore`, { method: "POST" }).then((response) =>
      parseResponse<GraphMeta>(response),
    ),
  deleteArchivedGraph: (id: string) =>
    fetch(`/api/archived-graphs/${id}`, { method: "DELETE" }).then((response) =>
      parseResponse<GraphMeta>(response),
    ),
  deleteAllArchivedGraphs: () =>
    fetch("/api/archived-graphs", { method: "DELETE" }).then((response) =>
      parseResponse<{ deleted: number }>(response),
    ),
  updateNode: (id: string, input: UpdateNodeInput) =>
    fetch(`/api/nodes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((response) => parseResponse<GraphNode>(response)),
  importText: (input: ImportTextInput) =>
    fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((response) => parseResponse<{ nodes: GraphNode[] }>(response)),
  restoreBackup: (backup: GraphBackup) =>
    fetch("/api/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(backup),
    }).then((response) => parseResponse<{ graphs: GraphDocument[] }>(response)),
  suggestMetadata: (nodeId: string) =>
    fetch(`/api/nodes/${nodeId}/suggest-metadata`, { method: "POST" }).then(
      (response) => parseResponse<MetadataSuggestion>(response),
    ),
  metrics: (graphId: string) =>
    fetch(`/api/graphs/${graphId}/metrics`).then((response) =>
      parseResponse<GraphMetrics>(response),
    ),
  undoGraph: (graphId: string) =>
    fetch(`/api/graphs/${graphId}/undo`, { method: "POST" }).then((response) =>
      parseResponse<GraphDocument>(response),
    ),
  recordGraphOpen: (graphId: string) =>
    fetch(`/api/graphs/${graphId}/events/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: productSessionId(),
        appVersion: APP_VERSION,
      }),
    }).then((response) => {
      if (!response.ok) throw new Error("Unable to record graph activity.");
    }),
  updateGraphLayout: (id: string, input: UpdateGraphLayoutInput) =>
    fetch(`/api/graphs/${id}/layout`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((response) => parseResponse<{ nodes: GraphNode[] }>(response)),
  validationReport: () =>
    fetch("/api/validation/export.json", { cache: "no-store" }).then((response) =>
      parseResponse<ProductValidationReport>(response),
    ),
  studyCards: (graphId: string) =>
    fetch(`/api/graphs/${graphId}/study`).then((response) =>
      parseResponse<StudyCard[]>(response),
    ),
  deleteNode: (id: string) =>
    fetch(`/api/nodes/${id}`, { method: "DELETE" }).then((response) => {
      if (!response.ok) throw new Error("Unable to delete the node.");
    }),
  saveSettings: (settings: ProviderSettings & { apiKey?: string }) =>
    fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    }).then((response) => parseResponse<ProviderSettings>(response)),
  codexAuthStatus: () =>
    fetch("/api/auth/openai-codex", { cache: "no-store" }).then((response) =>
      parseResponse<CodexAuthStatus>(response),
    ),
  ollamaModels: () =>
    fetch("/api/providers/ollama/models", { cache: "no-store" }).then(
      (response) => parseResponse<{ models: string[] }>(response),
    ),
  startCodexLogin: () =>
    fetch("/api/auth/openai-codex", { method: "POST" }).then((response) =>
      parseResponse<CodexAuthStatus>(response),
    ),
  logoutCodex: () =>
    fetch("/api/auth/openai-codex", { method: "DELETE" }).then((response) =>
      parseResponse<CodexAuthStatus>(response),
    ),
  run: async (
    request: RunRequest,
    onEvent: (event: RunStreamEvent) => void,
    signal?: AbortSignal,
  ) => {
    const response = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
    if (!response.ok || !response.body) {
      throw new Error("Unable to start this answer.");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (line.trim()) onEvent(JSON.parse(line) as RunStreamEvent);
      }
    }
    if (buffer.trim()) onEvent(JSON.parse(buffer) as RunStreamEvent);
  },
};
