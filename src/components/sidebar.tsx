import {
  BookMarked,
  ChevronsLeft,
  CircleHelp,
  Download,
  GitFork,
  Plus,
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

type SidebarProps = {
  graphs: GraphMeta[];
  nodes: GraphNode[];
};

export function Sidebar({ graphs, nodes }: SidebarProps) {
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
          aria-label="关闭侧边栏"
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
            aria-label="关闭侧边栏"
          >
            <X className="size-4" />
          </Button>
        </div>

        <Button
          variant="accent"
          className="mb-4 h-11 w-full justify-start rounded-xl px-3.5 shadow-none"
          onClick={() => {
            selectNode(null);
            useWorkspace.getState().openComposer();
          }}
        >
          <Plus className="size-4" /> 新建学习起点
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
            placeholder="搜索节点…"
            aria-label="搜索图谱节点"
          />
        </div>

        <nav className="space-y-1" aria-label="主要导航">
          <SidebarItem
            icon={GitFork}
            label="知识图"
            active={!search}
            badge={nodes.length}
            onClick={() => setSearch("")}
          />
          <SidebarItem
            icon={BookMarked}
            label="理解卡"
            active={search === "概念"}
            badge={nodes.filter((node) => node.kind === "concept").length}
            onClick={() => setSearch("概念")}
          />
        </nav>

        <div className="my-5 h-px bg-[var(--border)]" />

        <section className="min-h-0 flex-1 overflow-auto">
          <div className="mb-2 flex items-center justify-between px-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted-light)]">
              当前知识图
            </span>
            <ChevronsLeft className="size-3.5 text-[var(--muted-light)]" />
          </div>
          {graphs.map((graph) => (
            <button
              key={graph.id}
              className="mb-1 w-full rounded-xl bg-white/50 px-3 py-2.5 text-left transition hover:bg-white"
              onClick={() => {
                setSearch("");
                setSidebarOpen(false);
              }}
              aria-current="page"
            >
              <span className="mb-1 block truncate text-xs font-semibold text-[var(--ink)]">
                {graph.title}
              </span>
              <span className="block truncate text-[10px] text-[var(--muted-light)]">
                {graph.description}
              </span>
            </button>
          ))}

          <div className="mb-2 mt-5 px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted-light)]">
            最近浏览
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
                  {formatRelativeTime(node.updatedAt)}
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
            <Download className="size-3.5" /> 导出全部数据
          </a>
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[11px] font-medium text-[var(--muted)] hover:bg-black/[0.035] hover:text-[var(--ink)]"
          >
            <Settings2 className="size-3.5" /> 模型与设置
          </button>
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-[#e4eee6]/70 px-2.5 py-2 text-[10px] text-[#4a7158]">
            <Sparkles className="size-3.5" />
            <span>数据仅保存在本机</span>
            <CircleHelp className="ml-auto size-3" />
          </div>
        </div>
      </aside>
    </>
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
