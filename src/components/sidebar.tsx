import { useEffect, useState } from "react";
import {
  Archive,
  BookMarked,
  CircleHelp,
  Download,
  GitFork,
  Plus,
  Pencil,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  X,
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
}: SidebarProps) {
  const { locale, t } = useI18n();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGraph, setEditingGraph] = useState<GraphMeta | null>(null);
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
          "sidebar-shell z-40 flex h-full w-[252px] shrink-0 flex-col border-r border-[var(--border)] bg-[#f1efe8]/95 px-3.5 py-4 backdrop-blur-xl max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:shadow-2xl",
          !sidebarOpen && "max-lg:-translate-x-full",
        )}
      >
        <div className="mb-5 flex items-center justify-between px-2">
          <BrandMark />
          <Button
            variant="ghost"
            size="icon"
            className="size-8 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label={t("sidebar.close")}
          >
            <X className="size-4" />
          </Button>
        </div>

        <Button
          variant="accent"
          className="mb-4 h-11 w-full justify-start rounded-xl px-3.5 shadow-none"
          onClick={() => void onNewThread()}
        >
          <Plus className="size-4" /> {t("sidebar.newStart")}
          <span className="ml-auto rounded-md border border-black/10 px-1.5 py-0.5 text-[9px] opacity-60">
            N
          </span>
        </Button>

        <div className="relative mb-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--muted-light)]" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-9 w-full rounded-xl border border-transparent bg-black/[0.035] pl-9 pr-3 text-xs text-[var(--ink)] outline-none transition placeholder:text-[var(--muted-light)] focus:border-[var(--border)] focus:bg-white/65"
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
          <SidebarItem
            icon={BookMarked}
            label={t("sidebar.insightCards")}
            active={search === (locale === "zh" ? "概念" : "concept")}
            badge={nodes.filter((node) => node.kind === "concept").length}
            onClick={() => setSearch(locale === "zh" ? "概念" : "concept")}
          />
        </nav>

        <div className="my-5 h-px bg-[var(--border)]" />

        <section className="min-h-0 flex-1 overflow-auto">
          <div className="mb-2 flex items-center justify-between px-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted-light)]">
              {t("sidebar.graphs")}
            </span>
            <button
              type="button"
              className="grid size-6 place-items-center rounded-md text-[var(--muted-light)] hover:bg-black/5 hover:text-[var(--ink)]"
              aria-label={t("graph.new")}
              onClick={() => {
                setEditingGraph(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          {graphs.map((graph) => (
            <div
              key={graph.id}
              className={cn(
                "group mb-1 flex items-center rounded-xl border border-transparent bg-white/45 transition hover:bg-white",
                graph.id === activeGraphId &&
                  "border-[var(--border)] bg-white/80 shadow-sm",
              )}
            >
              <button
                className="min-w-0 flex-1 px-3 py-2.5 text-left"
                onClick={() => {
                  setSearch("");
                  setSidebarOpen(false);
                  onSelectGraph(graph.id);
                }}
                aria-current={graph.id === activeGraphId ? "page" : undefined}
              >
                <span className="mb-1 block truncate text-xs font-semibold text-[var(--ink)]">
                  {graph.title}
                </span>
                <span className="block truncate text-[10px] text-[var(--muted-light)]">
                  {graph.description || "—"}
                </span>
              </button>
              <button
                type="button"
                className="mr-2 grid size-7 shrink-0 place-items-center rounded-lg text-[var(--muted-light)] opacity-0 transition hover:bg-black/5 hover:text-[var(--ink)] group-hover:opacity-100 focus:opacity-100"
                aria-label={`${t("graph.edit")}: ${graph.title}`}
                onClick={() => {
                  setEditingGraph(graph);
                  setDialogOpen(true);
                }}
              >
                <Pencil className="size-3" />
              </button>
            </div>
          ))}

          {archivedGraphs.length > 0 && (
            <>
              <div className="mb-2 mt-5 px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted-light)]">
                {t("graph.archived")}
              </div>
              <div className="space-y-1">
                {archivedGraphs.map((graph) => (
                  <div
                    key={graph.id}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[var(--muted-light)]"
                  >
                    <Archive className="size-3 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-[10px]">
                      {graph.title}
                    </span>
                    <button
                      type="button"
                      className="grid size-6 place-items-center rounded-md hover:bg-black/5 hover:text-[var(--ink)]"
                      aria-label={t("graph.restore", { title: graph.title })}
                      onClick={() => void onRestoreGraph(graph.id)}
                    >
                      <RotateCcw className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="mb-2 mt-5 px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted-light)]">
            {t("sidebar.recent")}
          </div>
          <div className="space-y-0.5">
            {recentNodes.map((node) => (
              <button
                key={node.id}
                className="group w-full rounded-lg px-2.5 py-2 text-left hover:bg-black/[0.035]"
                onClick={() => {
                  selectNode(node.id);
                  setSidebarOpen(false);
                }}
              >
                <span className="block truncate text-[11px] font-medium text-[var(--muted)] group-hover:text-[var(--ink)]">
                  {node.title}
                </span>
                <span className="mt-0.5 block text-[9px] text-[var(--muted-light)]">
                  {formatRelativeTime(node.updatedAt, locale)}
                </span>
              </button>
            ))}
          </div>
        </section>

        <div className="mt-3 space-y-1 border-t border-[var(--border)] pt-3">
          <a
            href="/api/export"
            download
            className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[11px] font-medium text-[var(--muted)] hover:bg-black/[0.035] hover:text-[var(--ink)]"
          >
            <Download className="size-3.5" /> {t("sidebar.export")}
          </a>
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[11px] font-medium text-[var(--muted)] hover:bg-black/[0.035] hover:text-[var(--ink)]"
          >
            <Settings2 className="size-3.5" /> {t("sidebar.settings")}
          </button>
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-[#e4eee6]/70 px-2.5 py-2 text-[10px] text-[#4a7158]">
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
        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
        <div className="mt-5 flex items-center gap-2">
          {graph && (
            <Button
              variant="ghost"
              className="mr-auto text-red-600 hover:text-red-700"
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
        "flex h-9 w-full items-center gap-2.5 rounded-xl px-3 text-xs font-medium transition",
        active
          ? "bg-[var(--ink)] text-white shadow-sm"
          : "text-[var(--muted)] hover:bg-black/[0.035] hover:text-[var(--ink)]",
      )}
    >
      <Icon className="size-3.5" />
      {label}
      {badge !== undefined && (
        <span className={cn("ml-auto text-[10px]", active ? "text-white/55" : "text-[var(--muted-light)]")}>
          {badge}
        </span>
      )}
    </button>
  );
}
