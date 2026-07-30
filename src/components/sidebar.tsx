import { useEffect, useState } from "react";
import {
  Archive,
  CircleHelp,
  Download,
  GitFork,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  Pencil,
  Search,
  Settings2,
  Sparkles,
} from "lucide-react";
import type { GraphMeta, GraphNode } from "@shared/types";
import { BrandMark } from "./brand-mark";
import { Button } from "./ui/button";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useWorkspace } from "@/store/workspace";
import { useI18n } from "@/i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input, Label, Textarea } from "./ui/field";
import { ArchivedGraphsDialog } from "./archived-graphs-dialog";

type SidebarProps = {
  graphs: GraphMeta[];
  archivedGraphs: GraphMeta[];
  activeGraphId: string;
  nodes: GraphNode[];
  onSelectGraph: (id: string) => void;
  onCreateGraph: (input: {
    title: string;
    description: string;
  }) => Promise<void>;
  onNewThread: () => Promise<void>;
  onUpdateGraph: (
    id: string,
    input: { title: string; description: string },
  ) => Promise<void>;
  onArchiveGraph: (id: string) => Promise<void>;
  onRestoreGraph: (id: string) => Promise<void>;
  onDeleteArchivedGraph: (id: string) => Promise<void>;
  onDeleteAllArchivedGraphs: () => Promise<void>;
};

export function Sidebar({
  graphs,
  archivedGraphs,
  activeGraphId,
  nodes,
  onSelectGraph,
  onCreateGraph,
  onNewThread,
  onUpdateGraph,
  onArchiveGraph,
  onRestoreGraph,
  onDeleteArchivedGraph,
  onDeleteAllArchivedGraphs,
}: SidebarProps) {
  const { locale, t } = useI18n();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [editingGraph, setEditingGraph] = useState<GraphMeta | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    graph: GraphMeta;
    x: number;
    y: number;
  } | null>(null);
  const {
    search,
    setSearch,
    setSettingsOpen,
    sidebarOpen,
    setSidebarOpen,
    selectNode,
  } = useWorkspace();
  const recentNodes = [...nodes]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 4);
  const closeOnNarrowScreen = () => {
    if (window.innerWidth < 1024) setSidebarOpen(false);
  };

  return (
    <>
      {sidebarOpen && (
        <button
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label={t("sidebar.close")}
        />
      )}
      <aside
        className={cn(
          "sidebar-shell z-40 flex h-full shrink-0 flex-col overflow-hidden bg-[var(--paper)]/95 py-3 backdrop-blur-xl max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:shadow-[var(--shadow-lg)]",
          sidebarOpen
            ? "w-[252px] border-r border-[var(--border)] px-3.5 opacity-100"
            : "pointer-events-none w-0 -translate-x-full border-r-0 px-0 opacity-0",
        )}
        aria-hidden={!sidebarOpen}
        inert={!sidebarOpen}
        data-state={sidebarOpen ? "open" : "closed"}
        data-testid="sidebar"
      >
        <div className="mb-3 flex items-center justify-between px-2">
          <BrandMark />
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => setSidebarOpen(false)}
            aria-label={t("sidebar.close")}
          >
            <PanelLeftClose className="size-4" />
          </Button>
        </div>

        <Button
          variant="accent"
          className="mb-2.5 h-9 w-full justify-start rounded-lg px-3 shadow-none"
          onClick={() => void onNewThread()}
        >
          <Plus className="size-4" /> {t("sidebar.newStart")}
          <span className="ml-auto rounded-md border border-current px-1.5 py-0.5 text-[9px] opacity-70">
            N
          </span>
        </Button>

        <div className="relative mb-2.5">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--muted-light)]" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-8 w-full rounded-lg border border-transparent bg-[var(--hover)] pl-8 pr-3 text-[11px] text-[var(--ink)] outline-none transition placeholder:text-[var(--muted-light)] focus:border-[var(--accent)] focus:bg-[var(--surface)] focus:ring-2 focus:ring-[var(--accent-ring)]"
            placeholder={t("sidebar.searchPlaceholder")}
            aria-label={t("sidebar.searchLabel")}
          />
        </div>

        <nav className="space-y-1" aria-label={t("sidebar.primaryNav")}>
          <SidebarItem
            icon={GitFork}
            label={t("sidebar.knowledgeGraph")}
            active={!search}
            badge={nodes.length}
            onClick={() => setSearch("")}
          />
        </nav>

        <div className="my-2.5 h-px bg-[var(--border)]" />

        <section className="min-h-0 flex-1 overflow-auto">
          <div className="mb-2 flex items-center justify-between px-2">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted-light)]">
              {t("sidebar.graphs")}
              <span className="rounded-md bg-[var(--hover)] px-1.5 py-0.5 text-[8px] font-medium tracking-normal">
                {graphs.length}
              </span>
            </span>
            <button
              type="button"
              className="grid size-6 place-items-center rounded-md text-[var(--muted-light)] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
              aria-label={t("graph.new")}
              onClick={() => {
                setEditingGraph(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-xs)]">
          {graphs.map((graph) => (
            <div
              key={graph.id}
              className={cn(
                "group relative flex h-9 items-center border-b border-[var(--border)] transition last:border-b-0 hover:bg-[var(--hover)]",
                graph.id === activeGraphId && "bg-[var(--paper-deep)]",
              )}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setContextMenu({
                  graph,
                  x: Math.min(event.clientX, window.innerWidth - 180),
                  y: Math.min(event.clientY, window.innerHeight - 110),
                });
              }}
            >
              {graph.id === activeGraphId && (
                <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-r-sm bg-[var(--accent)]" />
              )}
              <button
                className="min-w-0 flex-1 px-3 text-left"
                onClick={() => {
                  setSearch("");
                  closeOnNarrowScreen();
                  onSelectGraph(graph.id);
                }}
                aria-current={graph.id === activeGraphId ? "page" : undefined}
              >
                <span className="block truncate text-[11px] font-semibold leading-3.5 text-[var(--ink)]">
                  {graph.title}
                </span>
                <span className="block truncate text-[8.5px] leading-3 text-[var(--muted-light)]">
                  {graph.description || "—"}
                </span>
              </button>
              <button
                type="button"
                className="mr-1.5 grid size-6 shrink-0 place-items-center rounded-md text-[var(--muted-light)] opacity-0 transition hover:bg-[var(--hover)] hover:text-[var(--ink)] group-hover:opacity-100 focus:opacity-100"
                aria-label={`${t("graph.edit")}: ${graph.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  const rect = event.currentTarget.getBoundingClientRect();
                  setContextMenu({
                    graph,
                    x: Math.min(rect.right - 160, window.innerWidth - 180),
                    y: Math.min(rect.bottom + 4, window.innerHeight - 110),
                  });
                }}
              >
                <MoreHorizontal className="size-3" />
              </button>
            </div>
          ))}
          </div>

          <div className="mb-1 mt-3 px-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--muted-light)]">
            {t("sidebar.recent")}
          </div>
          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-xs)]">
            {recentNodes.map((node) => (
              <button
                key={node.id}
                className="group h-8 w-full border-b border-[var(--border)] px-2.5 text-left last:border-b-0 hover:bg-[var(--hover)]"
                onClick={() => {
                  selectNode(node.id);
                  closeOnNarrowScreen();
                }}
              >
                <span className="block truncate text-[9.5px] font-medium leading-3.5 text-[var(--muted)] group-hover:text-[var(--ink)]">
                  {node.title}
                </span>
                <span className="block text-[8px] leading-3 text-[var(--muted-light)]">
                  {formatRelativeTime(node.updatedAt, locale)}
                </span>
              </button>
            ))}
          </div>
        </section>

        <div className="mt-2 space-y-0.5 border-t border-[var(--border)] pt-2">
          {archivedGraphs.length > 0 && (
            <button
              type="button"
              className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[10px] font-medium text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
              onClick={() => setArchiveDialogOpen(true)}
            >
              <Archive className="size-3.5" />
              <span>{t("sidebar.archivedThreads")}</span>
              <span className="ml-auto rounded-md bg-[var(--hover)] px-1.5 py-0.5 text-[8px] text-[var(--muted-light)]">
                {archivedGraphs.length}
              </span>
            </button>
          )}
          <a
            href="/api/export"
            download
            className="flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[10px] font-medium text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
          >
            <Download className="size-3.5" /> {t("sidebar.export")}
          </a>
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[10px] font-medium text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
          >
            <Settings2 className="size-3.5" /> {t("sidebar.settings")}
          </button>
          <div className="mt-1 flex h-8 items-center gap-2 rounded-lg bg-[var(--accent-soft)] px-2.5 text-[9px] text-[var(--accent-fg)]">
            <Sparkles className="size-3.5" />
            <span>{t("sidebar.localOnly")}</span>
            <CircleHelp className="ml-auto size-3" />
          </div>
        </div>
      </aside>
      <GraphDialog
        open={dialogOpen}
        graph={editingGraph}
        canArchive={graphs.length > 1}
        onOpenChange={setDialogOpen}
        onCreate={onCreateGraph}
        onUpdate={onUpdateGraph}
        onArchive={onArchiveGraph}
      />
      <ArchivedGraphsDialog
        open={archiveDialogOpen}
        graphs={archivedGraphs}
        onOpenChange={setArchiveDialogOpen}
        onRestore={async (id) => {
          await onRestoreGraph(id);
          if (archivedGraphs.length === 1) setArchiveDialogOpen(false);
        }}
        onDelete={async (id) => {
          await onDeleteArchivedGraph(id);
          if (archivedGraphs.length === 1) setArchiveDialogOpen(false);
        }}
        onDeleteAll={async () => {
          await onDeleteAllArchivedGraphs();
          setArchiveDialogOpen(false);
        }}
      />
      {contextMenu && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[79] cursor-default"
            aria-label={t("dialog.close")}
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed z-[80] w-40 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-lg)]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            role="menu"
            aria-label={`Thread actions: ${contextMenu.graph.title}`}
          >
          <button
            type="button"
            role="menuitem"
            className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[11px] text-[var(--ink)] hover:bg-[var(--hover)]"
            onClick={() => {
              setEditingGraph(contextMenu.graph);
              setDialogOpen(true);
              setContextMenu(null);
            }}
          >
            <Pencil className="size-3.5" /> {t("sidebar.renameEdit")}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={graphs.length <= 1}
            className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[11px] text-[var(--danger)] hover:bg-[var(--danger-soft)] disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => {
              const graph = contextMenu.graph;
              setContextMenu(null);
              if (
                graphs.length > 1 &&
                window.confirm(t("graph.archiveConfirm", { title: graph.title }))
              ) {
                void onArchiveGraph(graph.id);
              }
            }}
          >
            <Archive className="size-3.5" /> {t("sidebar.archive")}
          </button>
          </div>
        </>
      )}
    </>
  );
}

function GraphDialog({
  open,
  graph,
  canArchive,
  onOpenChange,
  onCreate,
  onUpdate,
  onArchive,
}: {
  open: boolean;
  graph: GraphMeta | null;
  canArchive: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: SidebarProps["onCreateGraph"];
  onUpdate: SidebarProps["onUpdateGraph"];
  onArchive: SidebarProps["onArchiveGraph"];
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(graph?.title ?? "");
    setDescription(graph?.description ?? "");
    setError("");
  }, [graph, open]);

  const save = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const input = { title: title.trim(), description: description.trim() };
      if (graph) await onUpdate(graph.id, input);
      else await onCreate(input);
      onOpenChange(false);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : t("graph.actionFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!graph || !canArchive || busy) return;
    if (
      !window.confirm(t("graph.archiveConfirm", { title: graph.title }))
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onArchive(graph.id);
      onOpenChange(false);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : t("graph.actionFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(92vw,500px)]">
        <DialogHeader>
          <DialogTitle>
            {graph ? t("graph.editTitle") : t("graph.createTitle")}
          </DialogTitle>
          <DialogDescription>
            {graph?.description || t("graph.descriptionPlaceholder")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="graph-title">{t("graph.title")}</Label>
            <Input
              id="graph-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("graph.titlePlaceholder")}
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="graph-description">
              {t("graph.description")}
            </Label>
            <Textarea
              id="graph-description"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("graph.descriptionPlaceholder")}
            />
          </div>
        </div>
        {error && <p className="mt-3 text-xs text-[var(--danger)]">{error}</p>}
        <div className="mt-5 flex items-center gap-2">
          {graph && (
            <Button
              variant="danger"
              className="mr-auto"
              disabled={!canArchive || busy}
              onClick={() => void archive()}
              title={!canArchive ? t("graph.lastActive") : undefined}
            >
              <Archive className="size-3.5" /> {t("graph.archive")}
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("settings.cancel")}
          </Button>
          <Button disabled={!title.trim() || busy} onClick={() => void save()}>
            {graph ? t("graph.save") : t("graph.create")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SidebarItem({
  icon: Icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: typeof GitFork;
  label: string;
  active?: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center gap-2.5 rounded-lg px-3 text-[11px] font-medium transition",
        active
          ? "bg-[var(--ink)] text-[var(--accent-contrast)] shadow-[var(--shadow-xs)]"
          : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]",
      )}
    >
      <Icon className="size-3.5" />
      {label}
      {badge !== undefined && (
        <span className={cn("ml-auto text-[10px]", active ? "text-[var(--accent-contrast)] opacity-60" : "text-[var(--muted-light)]")}>
          {badge}
        </span>
      )}
    </button>
  );
}
