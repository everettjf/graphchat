import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, LoaderCircle, RefreshCw } from "lucide-react";
import type {
  GraphDocument,
  ProviderSettings,
  RunStreamEvent,
} from "@shared/types";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { GraphCanvas, type GraphFlowInstance } from "@/components/graph-canvas";
import { Inspector } from "@/components/inspector";
import { Composer } from "@/components/composer";
import { SettingsDialog } from "@/components/settings-dialog";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";
import { useWorkspace } from "@/store/workspace";

export default function App() {
  const bootstrap = useQuery({ queryKey: ["bootstrap"], queryFn: api.bootstrap });
  const [document, setDocumentState] = useState<GraphDocument | null>(null);
  const [settings, setSettings] = useState<ProviderSettings>({
    provider: "demo",
    model: "graphchat-guide",
    baseUrl: "",
    hasApiKey: false,
  });
  const [toast, setToast] = useState("");
  const selectedNodeId = useWorkspace((state) => state.selectedNodeId);
  const selectNode = useWorkspace((state) => state.selectNode);
  const flowRef = useRef<GraphFlowInstance | null>(null);

  useEffect(() => {
    if (bootstrap.data?.activeGraph && !document) {
      setDocumentState(bootstrap.data.activeGraph);
      setSettings(bootstrap.data.settings);
    }
  }, [bootstrap.data, document]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      const workspace = useWorkspace.getState();
      if (
        isTyping ||
        workspace.composerOpen ||
        workspace.settingsOpen ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }
      if (event.key.toLocaleLowerCase() === "n") {
        event.preventDefault();
        selectNode(null);
        workspace.openComposer();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [selectNode]);

  const setDocument = useCallback(
    (updater: (current: GraphDocument) => GraphDocument) => {
      setDocumentState((current) => (current ? updater(current) : current));
    },
    [],
  );

  const refreshGraph = useCallback(async () => {
    if (!document) return;
    const fresh = await api.graph(document.graph.id);
    setDocumentState(fresh);
  }, [document]);

  const selectedNode = useMemo(
    () => document?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [document, selectedNodeId],
  );

  const handleRunEvent = useCallback(
    (event: RunStreamEvent) => {
      if (event.type === "run_started") {
        const parentNodeId = useWorkspace.getState().selectedNodeId;
        const referenceIds = useWorkspace.getState().referenceNodeIds;
        setDocument((current) => {
          const edges = [...current.edges];
          if (parentNodeId) {
            edges.push({
              id: `optimistic-branch-${event.node.id}`,
              graphId: current.graph.id,
              source: parentNodeId,
              target: event.node.id,
              kind: "branch",
              label: "继续追问",
              includeInContext: true,
              createdAt: new Date().toISOString(),
            });
          }
          for (const source of referenceIds.filter((id) => id !== parentNodeId)) {
            edges.push({
              id: `optimistic-ref-${source}-${event.node.id}`,
              graphId: current.graph.id,
              source,
              target: event.node.id,
              kind: "reference",
              label: "引用",
              includeInContext: true,
              createdAt: new Date().toISOString(),
            });
          }
          return { ...current, nodes: [...current.nodes, event.node], edges };
        });
        selectNode(event.node.id);
        setTimeout(() => flowRef.current?.fitView({ padding: 0.18, duration: 500 }), 80);
      } else if (event.type === "text_delta") {
        const activeId = useWorkspace.getState().selectedNodeId;
        setDocument((current) => ({
          ...current,
          nodes: current.nodes.map((node) =>
            node.id === activeId ? { ...node, content: node.content + event.delta } : node,
          ),
        }));
      } else if (event.type === "run_finished") {
        setDocument((current) => ({
          ...current,
          nodes: current.nodes.map((node) => (node.id === event.node.id ? event.node : node)),
        }));
        void refreshGraph();
        setToast("回答已保存到知识图");
        setTimeout(() => setToast(""), 2_400);
      } else if (event.type === "run_failed") {
        setToast(event.message);
        setTimeout(() => setToast(""), 4_000);
      }
    },
    [refreshGraph, selectNode, setDocument],
  );

  const handleDelete = async (id: string) => {
    if (!window.confirm("删除这个节点及与它相连的关系？此操作无法撤销。")) return;
    await api.deleteNode(id);
    setDocument((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => node.id !== id),
      edges: current.edges.filter((edge) => edge.source !== id && edge.target !== id),
    }));
    selectNode(null);
  };

  if (bootstrap.isLoading || (!document && !bootstrap.isError)) {
    return (
      <main className="grid h-screen place-items-center bg-[var(--paper)]">
        <div className="flex flex-col items-center gap-5">
          <BrandMark />
          <LoaderCircle className="size-5 animate-spin text-[#719a7e]" />
          <p className="text-xs text-[var(--muted-light)]">正在打开你的知识图…</p>
        </div>
      </main>
    );
  }

  if (bootstrap.isError || !document) {
    return (
      <main className="grid h-screen place-items-center bg-[var(--paper)] p-6">
        <div className="max-w-sm rounded-3xl border border-red-100 bg-white p-8 text-center shadow-xl">
          <AlertCircle className="mx-auto mb-4 size-8 text-red-500" />
          <h1 className="font-display text-xl font-semibold">无法打开 Graph Chat</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            {bootstrap.error instanceof Error ? bootstrap.error.message : "本地服务暂时不可用。"}
          </p>
          <Button className="mt-5" onClick={() => void bootstrap.refetch()}>
            <RefreshCw className="size-4" /> 重试
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-dvh overflow-hidden bg-[var(--paper)] text-[var(--ink)]">
      <Sidebar graphs={bootstrap.data?.graphs ?? [document.graph]} nodes={document.nodes} />
      <section className="flex min-w-0 flex-1 flex-col">
        <Topbar
          document={document}
          settings={settings}
          onFitView={() => flowRef.current?.fitView({ padding: 0.18, duration: 450 })}
        />
        <div className="relative min-h-0 flex-1">
          <GraphCanvas
            document={document}
            setDocument={setDocument}
            onFlowReady={(instance) => {
              flowRef.current = instance;
            }}
          />
          <Composer document={document} settings={settings} onEvent={handleRunEvent} />
        </div>
      </section>
      <Inspector node={selectedNode} document={document} onDelete={(id) => void handleDelete(id)} />
      <SettingsDialog settings={settings} onSaved={setSettings} />
      {toast && (
        <div className="fixed bottom-5 right-5 z-[90] rounded-xl bg-[var(--ink)] px-4 py-3 text-xs font-medium text-white shadow-2xl">
          {toast}
        </div>
      )}
    </main>
  );
}
