import type {
  CodexAuthStatus,
  GraphDocument,
  GraphMeta,
  GraphNode,
  ProviderSettings,
  RunRequest,
  RunStreamEvent,
  UpdateNodeInput,
} from "@shared/types";

type BootstrapData = {
  graphs: GraphMeta[];
  activeGraph: GraphDocument | null;
  settings: ProviderSettings;
};

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(error?.message || `请求失败（${response.status}）`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  bootstrap: () => fetch("/api/bootstrap").then((response) => parseResponse<BootstrapData>(response)),
  graph: (id: string) => fetch(`/api/graphs/${id}`).then((response) => parseResponse<GraphDocument>(response)),
  updateNode: (id: string, input: UpdateNodeInput) =>
    fetch(`/api/nodes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((response) => parseResponse<GraphNode>(response)),
  deleteNode: (id: string) =>
    fetch(`/api/nodes/${id}`, { method: "DELETE" }).then((response) => {
      if (!response.ok) throw new Error("删除节点失败。");
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
      throw new Error("无法启动这次回答。");
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
