import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, BookOpen, LoaderCircle, RefreshCw } from "lucide-react";
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
import { KnowledgeTree } from "@/components/knowledge-tree";
import { PiSessionView } from "@/components/pi-session-view";
import { SplitHandle } from "@/components/split-handle";
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
    provider: "ollama",
    model: "qwen3.5:4b",
    baseUrl: "http://127.0.0.1:11434/v1",
    hasApiKey: false,
  });
  const [toast, setToast] = useState("");
  const toastTimer = useRef<number | null>(null);
  // One timer for all toasts: an older toast's timeout must not clear a newer one.
  const showToast = useCallback((message: string, durationMs = 2_400) => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => {
      toastTimer.current = null;
      setToast("");
    }, durationMs);
  }, []);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"content" | "tree" | "graph">("content");
  const [piSessionId, setPiSessionId] = useState<string | null>(null);
  const piSessions = useQuery({
    queryKey: ["pi-sessions"],
    queryFn: api.piSessions,
    refetchInterval: 8_000,
  });
  const [conversationWidth, setConversationWidth] = useState(() => {
    const saved = Number(window.localStorage.getItem("graphchat-conversation-width"));
    return saved >= 30 && saved <= 75 ? saved : 50;
  });
  const selectedNodeId = useWorkspace((state) => state.selectedNodeId);
  const inspectorOpen = useWorkspace((state) => state.inspectorOpen);
  const selectNode = useWorkspace((state) => state.selectNode);
  const clearReferences = useWorkspace((state) => state.clearReferences);
  const flowRef = useRef<GraphFlowInstance | null>(null);

  // Leaving a graph turns its selected references into external references,
  // so a question in the next graph can still cite them.
  const carryReferences = useCallback(() => {
    const workspace = useWorkspace.getState();
    const current = document;
    if (current) {
      for (const nodeId of workspace.referenceNodeIds) {
        const node = current.nodes.find((candidate) => candidate.id === nodeId);
        if (node) {
          workspace.addExternalReference({
            kind: "node",
            nodeId,
            title: node.title,
            graphTitle: current.graph.title,
          });
        }
      }
    }
    workspace.clearReferences();
  }, [document]);

  useEffect(() => {
    window.localStorage.setItem(
      "graphchat-conversation-width",
      String(conversationWidth),
    );
  }, [conversationWidth]);

  useEffect(() => {
    if (!bootstrap.data || document) return;
    let active = true;
    const initialize = async () => {
      setGraphs(bootstrap.data.graphs);
      setArchivedGraphs(bootstrap.data.archivedGraphs);
      setSettings(bootstrap.data.settings);
      // Deep links from the Pi extension's /graph command.
      const url = new URL(window.location.href);
      const linkedPiSession = url.searchParams.get("pi");
      const linkedGraphId = url.searchParams.get("graph");
      if (linkedPiSession || linkedGraphId) {
        url.searchParams.delete("pi");
        url.searchParams.delete("graph");
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      }
      const savedId = linkedGraphId ?? window.localStorage.getItem("graphchat-active-graph");
      const savedGraph = savedId
        ? bootstrap.data.graphs.find((graph) => graph.id === savedId)
        : null;
      const initial =
        savedGraph && bootstrap.data.activeGraph?.graph.id !== savedGraph.id
          ? await api.graph(savedGraph.id)
          : bootstrap.data.activeGraph;
      if (!active || !initial) return;
      setDocumentState(initial);
      if (linkedPiSession) setPiSessionId(linkedPiSession);
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
    setGraphs((current) =>
      current.map((graph) =>
        graph.id === fresh.graph.id ? fresh.graph : graph,
      ),
    );
  }, [document]);

  const openGraph = useCallback(
    async (id: string) => {
      setPiSessionId(null);
      if (document?.graph.id === id) return;
      const next = await api.graph(id);
      carryReferences();
      setDocumentState(next);
      window.localStorage.setItem("graphchat-active-graph", id);
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
    [carryReferences, document?.graph.id, selectNode],
  );

  const createGraph = useCallback(
    async (input: { title: string; description: string; projectDir?: string | null }) => {
      const created = await api.createGraph(input);
      setPiSessionId(null);
      setGraphs((current) => [created.graph, ...current]);
      carryReferences();
      setDocumentState(created);
      window.localStorage.setItem("graphchat-active-graph", created.graph.id);
      selectNode(null);
      setViewMode("content");
    },
    [carryReferences, selectNode],
  );

  const startNewThread = useCallback(async () => {
    if (document?.nodes.length === 0) {
      clearReferences();
      selectNode(null);
      setViewMode("content");
      useWorkspace.getState().openComposer();
      return;
    }

    await createGraph({
      title:
        locale.startsWith("zh")
          ? `学习线程 ${graphs.length + 1}`
          : `Thread ${graphs.length + 1}`,
      description:
        locale.startsWith("zh")
          ? "从一个新问题开始的独立学习空间"
          : "An independent learning space starting from a new question",
    });
    useWorkspace.getState().openComposer();
  }, [
    clearReferences,
    createGraph,
    document?.nodes.length,
    graphs.length,
    locale,
    selectNode,
  ]);

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
        void startNewThread();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [startNewThread]);

  const updateGraph = useCallback(
    async (id: string, input: { title: string; description: string; projectDir?: string | null }) => {
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

  const deleteArchivedGraph = useCallback(async (id: string) => {
    await api.deleteArchivedGraph(id);
    setArchivedGraphs((current) => current.filter((graph) => graph.id !== id));
  }, []);

  const deleteAllArchivedGraphs = useCallback(async () => {
    await api.deleteAllArchivedGraphs();
    setArchivedGraphs([]);
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
              id: `optimistic-${event.relationKind}-${event.node.id}`,
              graphId: current.graph.id,
              source: parentNodeId,
              target: event.node.id,
              kind: event.relationKind,
              label:
                event.relationKind === "branch"
                  ? t("edge.branch")
                  : t("edge.continue"),
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
      } else if (event.type === "tool_started" || event.type === "tool_finished") {
        const call = event.call;
        if (call) {
          setDocument((current) => ({
            ...current,
            nodes: current.nodes.map((node) =>
              node.id === event.nodeId
                ? {
                    ...node,
                    toolCalls: node.toolCalls.some((existing) => existing.id === call.id)
                      ? node.toolCalls.map((existing) => (existing.id === call.id ? call : existing))
                      : [...node.toolCalls, call],
                  }
                : node,
            ),
          }));
        }
      } else if (event.type === "run_finished") {
        setDocument((current) => ({
          ...current,
          nodes: current.nodes.map((node) => (node.id === event.node.id ? event.node : node)),
        }));
        window.setTimeout(() => void refreshGraph(), 350);
        showToast(t("app.answerSaved"), 2_400);
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
        showToast(event.message, 2_400);
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
        showToast(event.message, 4_000);
      }
    },
    [refreshGraph, selectNode, setDocument, t],
  );

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
      showToast(locale.startsWith("zh") ? "已撤销上一步图谱修改" : "Last graph change undone", 2_400);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Nothing to undo", 2_400);
    }
  }, [document, locale]);

  if (bootstrap.isLoading || (!document && !bootstrap.isError)) {
    return (
      <main className="grid h-screen place-items-center bg-[var(--paper)]">
        <div className="flex flex-col items-center gap-5">
          <BrandMark />
          <LoaderCircle className="size-5 animate-spin text-[var(--accent)]" />
          <p className="text-xs text-[var(--muted-light)]">{t("app.loading")}</p>
        </div>
      </main>
    );
  }

  if (bootstrap.isError || !document) {
    return (
      <main className="grid h-screen place-items-center bg-[var(--paper)] p-6">
        <div className="max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-[var(--shadow-md)]">
          <AlertCircle className="mx-auto mb-4 size-8 text-[var(--danger)]" />
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
        piSessions={piSessions.data?.sessions ?? []}
        piSessionDir={piSessions.data?.sessionDir ?? ""}
        activePiSessionId={piSessionId}
        onSelectPiSession={setPiSessionId}
        onSelectGraph={(id) => void openGraph(id)}
        onCreateGraph={createGraph}
        onNewThread={startNewThread}
        onUpdateGraph={updateGraph}
        onArchiveGraph={archiveGraph}
        onRestoreGraph={restoreGraph}
        onDeleteArchivedGraph={deleteArchivedGraph}
        onDeleteAllArchivedGraphs={deleteAllArchivedGraphs}
      />
      {piSessionId ? (
        <PiSessionView
          sessionId={piSessionId}
          onBack={() => setPiSessionId(null)}
          onOpenGraph={(id) => void openGraph(id)}
          onToast={showToast}
        />
      ) : (
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          document={document}
          settings={settings}
          onFitView={() => flowRef.current?.fitView({ padding: 0.18, duration: 450 })}
          onOpenTools={() => setToolsOpen(true)}
          onUndo={() => void handleUndo()}
          onToast={showToast}
          piCwd={bootstrap.data?.piCwd ?? ""}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
        <div className="flex min-h-0 min-w-0 flex-1">
          <section
            className="flex min-w-0 shrink-0 flex-col max-md:w-full md:w-[var(--conversation-width)]"
            style={{
              "--conversation-width":
                viewMode === "content" && inspectorOpen
                  ? `${conversationWidth}%`
                  : "100%",
            } as CSSProperties}
          >
        <div className="relative min-h-0 flex-1">
          {viewMode === "graph" ? (
            <GraphCanvas
              document={document}
              setDocument={setDocument}
          onFlowReady={(instance) => {
            flowRef.current = instance;
          }}
          onError={showToast}
              onNodeOpen={() => setViewMode("content")}
            />
          ) : viewMode === "tree" ? (
            <KnowledgeTree
              document={document}
              mode="full"
              onNodeOpen={() => setViewMode("content")}
            />
          ) : selectedNode ? (
            <Inspector
              embedded
              node={selectedNode}
              document={document}
              onUpdate={(id, input) => void handleUpdateNode(id, input)}
            />
          ) : (
            <div className="grid h-full place-items-center px-6 pb-24" data-testid="empty-content">
              <div className="max-w-sm text-center">
                <div className="mx-auto mb-4 grid size-12 place-items-center rounded-xl border border-[var(--border)] bg-[var(--accent-soft)] text-[var(--accent-fg)] shadow-[var(--shadow-xs)]">
                  <BookOpen className="size-5" />
                </div>
                <h2 className="font-display text-xl font-semibold">
                  {locale.startsWith("zh") ? "从第一个问题开始" : "Start with your first question"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  {locale.startsWith("zh")
                    ? "详细内容会显示在这里，右侧知识树会随着追问逐步生长。"
                    : "Detailed content appears here while the knowledge tree grows on the right."}
                </p>
              </div>
            </div>
          )}
          {viewMode === "content" && (
            <Composer document={document} settings={settings} onEvent={handleRunEvent} />
          )}
        </div>
          </section>
          {viewMode === "content" && inspectorOpen && (
            <>
              <SplitHandle value={conversationWidth} onChange={setConversationWidth} />
              <KnowledgeTree
                document={document}
                onNodeOpen={() => setViewMode("content")}
              />
            </>
          )}
        </div>
      </div>
      )}
      <SettingsDialog settings={settings} onSaved={setSettings} />
      <WorkspaceTools
        document={document}
        open={toolsOpen}
        onOpenChange={setToolsOpen}
        onImported={refreshGraph}
      />
      {toast && (
        <div className="fixed bottom-5 right-5 z-[90] rounded-lg border border-[var(--border)] bg-[var(--ink)] px-3.5 py-2.5 text-xs font-medium text-[var(--paper)] shadow-[var(--shadow-lg)]">
          {toast}
        </div>
      )}
    </main>
  );
}
