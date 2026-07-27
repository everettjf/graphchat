import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, LoaderCircle, RefreshCw } from "lucide-react";
import type {
  GraphDocument,
  GraphMeta,
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
import { WorkspaceTools } from "@/components/workspace-tools";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";
import { useWorkspace } from "@/store/workspace";
import { useI18n } from "@/i18n";

export default function App() {
  const { locale, t } = useI18n();
  const bootstrap = useQuery({ queryKey: ["bootstrap"], queryFn: api.bootstrap });
  const [document, setDocumentState] = useState<GraphDocument | null>(null);
  const [graphs, setGraphs] = useState<GraphMeta[]>([]);
  const [archivedGraphs, setArchivedGraphs] = useState<GraphMeta[]>([]);
  const [settings, setSettings] = useState<ProviderSettings>({
    provider: "demo",
    model: "graphchat-guide",
    baseUrl: "",
    hasApiKey: false,
  });
  const [toast, setToast] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);
  const selectedNodeId = useWorkspace((state) => state.selectedNodeId);
  const selectNode = useWorkspace((state) => state.selectNode);
  const clearReferences = useWorkspace((state) => state.clearReferences);
  const flowRef = useRef<GraphFlowInstance | null>(null);

  useEffect(() => {
    if (!bootstrap.data || document) return;
    let active = true;
    const initialize = async () => {
      setGraphs(bootstrap.data.graphs);
      setArchivedGraphs(bootstrap.data.archivedGraphs);
      setSettings(bootstrap.data.settings);
      const savedId = window.localStorage.getItem("graphchat-active-graph");
      const savedGraph = savedId
        ? bootstrap.data.graphs.find((graph) => graph.id === savedId)
        : null;
      const initial =
        savedGraph && bootstrap.data.activeGraph?.graph.id !== savedGraph.id
          ? await api.graph(savedGraph.id)
          : bootstrap.data.activeGraph;
      if (!active || !initial) return;
      setDocumentState(initial);
      void api.recordGraphOpen(initial.graph.id);
      selectNode(
        window.matchMedia("(min-width: 1280px)").matches
          ? initial.nodes[0]?.id ?? null
          : null,
      );
    };
    void initialize();
    return () => {
      active = false;
    };
  }, [bootstrap.data, document, selectNode]);

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

  const openGraph = useCallback(
    async (id: string) => {
      const next = await api.graph(id);
      setDocumentState(next);
      void api.recordGraphOpen(next.graph.id);
      window.localStorage.setItem("graphchat-active-graph", id);
      clearReferences();
      selectNode(
        window.matchMedia("(min-width: 1280px)").matches
          ? next.nodes[0]?.id ?? null
          : null,
      );
      window.setTimeout(
        () => flowRef.current?.fitView({ padding: 0.18, duration: 450 }),
        80,
      );
    },
    [clearReferences, selectNode],
  );

  const createGraph = useCallback(
    async (input: { title: string; description: string }) => {
      const created = await api.createGraph(input);
      setGraphs((current) => [created.graph, ...current]);
      setDocumentState(created);
      window.localStorage.setItem("graphchat-active-graph", created.graph.id);
      clearReferences();
      selectNode(null);
    },
    [clearReferences, selectNode],
  );

  const updateGraph = useCallback(
    async (id: string, input: { title: string; description: string }) => {
      const updated = await api.updateGraph(id, input);
      setGraphs((current) =>
        current.map((graph) => (graph.id === id ? updated : graph)),
      );
      setDocumentState((current) =>
        current?.graph.id === id ? { ...current, graph: updated } : current,
      );
    },
    [],
  );

  const archiveGraph = useCallback(
    async (id: string) => {
      const archived = await api.archiveGraph(id);
      const remaining = graphs.filter((graph) => graph.id !== id);
      setGraphs(remaining);
      setArchivedGraphs((current) => [archived, ...current]);
      if (document?.graph.id === id && remaining[0]) {
        await openGraph(remaining[0].id);
      }
    },
    [document?.graph.id, graphs, openGraph],
  );

  const restoreGraph = useCallback(async (id: string) => {
    const restored = await api.restoreGraph(id);
    setArchivedGraphs((current) => current.filter((graph) => graph.id !== id));
    setGraphs((current) => [restored, ...current]);
  }, []);

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
              label: t("edge.continue"),
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
              label: t("edge.reference"),
              includeInContext: true,
              createdAt: new Date().toISOString(),
            });
          }
          return { ...current, nodes: [...current.nodes, event.node], edges };
        });
        selectNode(event.node.id);
        setTimeout(() => flowRef.current?.fitView({ padding: 0.18, duration: 500 }), 80);
      } else if (event.type === "text_delta") {
        setDocument((current) => ({
          ...current,
          nodes: current.nodes.map((node) =>
            node.id === event.nodeId ? { ...node, content: node.content + event.delta } : node,
          ),
        }));
      } else if (event.type === "run_finished") {
        setDocument((current) => ({
          ...current,
          nodes: current.nodes.map((node) => (node.id === event.node.id ? event.node : node)),
        }));
        window.setTimeout(() => void refreshGraph(), 350);
        setToast(t("app.answerSaved"));
        setTimeout(() => setToast(""), 2_400);
      } else if (event.type === "run_cancelled") {
        setDocument((current) => ({
          ...current,
          nodes: current.nodes.map((node) =>
            node.id === event.nodeId
              ? event.node || { ...node, status: "cancelled" }
              : node,
          ),
        }));
        window.setTimeout(() => void refreshGraph(), 350);
        setToast(event.message);
        setTimeout(() => setToast(""), 2_400);
      } else if (event.type === "run_failed") {
        if (event.nodeId) {
          setDocument((current) => ({
            ...current,
            nodes: current.nodes.map((node) =>
              node.id === event.nodeId
                ? event.node || { ...node, status: "error" }
                : node,
            ),
          }));
        }
        window.setTimeout(() => void refreshGraph(), 350);
        setToast(event.message);
        setTimeout(() => setToast(""), 4_000);
      }
    },
    [refreshGraph, selectNode, setDocument, t],
  );

  const handleDelete = async (id: string) => {
    if (!window.confirm(t("app.deleteConfirm"))) return;
    await api.deleteNode(id);
    setDocument((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => node.id !== id),
      edges: current.edges.filter((edge) => edge.source !== id && edge.target !== id),
    }));
    selectNode(null);
  };

  const handleUpdateNode = useCallback(async (id: string, input: Parameters<typeof api.updateNode>[1]) => {
    const updated = await api.updateNode(id, input);
    setDocument((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === id ? updated : node)),
    }));
  }, [setDocument]);

  const handleUndo = useCallback(async () => {
    if (!document) return;
    try {
      const restored = await api.undoGraph(document.graph.id);
      setDocumentState(restored);
      setToast(locale === "zh" ? "已撤销上一步图谱修改" : "Last graph change undone");
      setTimeout(() => setToast(""), 2_400);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Nothing to undo");
      setTimeout(() => setToast(""), 2_400);
    }
  }, [document, locale]);

  if (bootstrap.isLoading || (!document && !bootstrap.isError)) {
    return (
      <main className="grid h-screen place-items-center bg-[var(--paper)]">
        <div className="flex flex-col items-center gap-5">
          <BrandMark />
          <LoaderCircle className="size-5 animate-spin text-[#719a7e]" />
          <p className="text-xs text-[var(--muted-light)]">{t("app.loading")}</p>
        </div>
      </main>
    );
  }

  if (bootstrap.isError || !document) {
    return (
      <main className="grid h-screen place-items-center bg-[var(--paper)] p-6">
        <div className="max-w-sm rounded-3xl border border-red-100 bg-white p-8 text-center shadow-xl">
          <AlertCircle className="mx-auto mb-4 size-8 text-red-500" />
          <h1 className="font-display text-xl font-semibold">{t("app.openFailed")}</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            {bootstrap.error instanceof Error
              ? bootstrap.error.message
              : t("app.serviceUnavailable")}
          </p>
          <Button className="mt-5" onClick={() => void bootstrap.refetch()}>
            <RefreshCw className="size-4" /> {t("app.retry")}
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-dvh overflow-hidden bg-[var(--paper)] text-[var(--ink)]">
      <Sidebar
        graphs={graphs.length ? graphs : [document.graph]}
        archivedGraphs={archivedGraphs}
        activeGraphId={document.graph.id}
        nodes={document.nodes}
        onSelectGraph={(id) => void openGraph(id)}
        onCreateGraph={createGraph}
        onUpdateGraph={updateGraph}
        onArchiveGraph={archiveGraph}
        onRestoreGraph={restoreGraph}
      />
      <section className="flex min-w-0 flex-1 flex-col">
        <Topbar
          document={document}
          settings={settings}
          onFitView={() => flowRef.current?.fitView({ padding: 0.18, duration: 450 })}
          onOpenTools={() => setToolsOpen(true)}
          onUndo={() => void handleUndo()}
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
      <Inspector
        node={selectedNode}
        document={document}
        onDelete={(id) => void handleDelete(id)}
        onUpdate={(id, input) => void handleUpdateNode(id, input)}
      />
      <SettingsDialog settings={settings} onSaved={setSettings} />
      <WorkspaceTools
        document={document}
        open={toolsOpen}
        onOpenChange={setToolsOpen}
        onImported={refreshGraph}
      />
      {toast && (
        <div className="fixed bottom-5 right-5 z-[90] rounded-xl bg-[var(--ink)] px-4 py-3 text-xs font-medium text-white shadow-2xl">
          {toast}
        </div>
      )}
    </main>
  );
}
