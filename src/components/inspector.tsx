import {
  ArrowLeft,
  Braces,
  CheckCircle2,
  Copy,
  GitBranch,
  Link2,
  MessageSquarePlus,
  Network,
  Quote,
  Trash2,
  X,
} from "lucide-react";
import type { GraphDocument, GraphNode } from "@shared/types";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Markdown } from "./markdown";
import { useWorkspace } from "@/store/workspace";
import { cn, formatRelativeTime } from "@/lib/utils";

export function Inspector({
  node,
  document,
  onDelete,
}: {
  node: GraphNode | null;
  document: GraphDocument;
  onDelete: (id: string) => void;
}) {
  const {
    referenceNodeIds,
    toggleReference,
    openComposer,
    setInspectorOpen,
    inspectorOpen,
  } = useWorkspace();

  if (!node || !inspectorOpen) return null;
  const incoming = document.edges.filter((edge) => edge.target === node.id);
  const outgoing = document.edges.filter((edge) => edge.source === node.id);
  const isReferenced = referenceNodeIds.includes(node.id);

  const captureSelection = () => {
    const selection = window.getSelection()?.toString().trim();
    if (selection && selection.length <= 1_500) openComposer(selection);
  };

  return (
    <aside
      className="inspector-shell z-20 flex h-full w-[382px] shrink-0 flex-col border-l border-[var(--border)] bg-[#fbfaf6]/94 backdrop-blur-xl max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:shadow-2xl"
      data-testid="node-inspector"
    >
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--border)] px-5">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="关闭详情"
            onClick={() => setInspectorOpen(false)}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <span className="text-xs font-semibold text-[var(--muted)]">节点详情</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => void navigator.clipboard.writeText(node.content)}
            aria-label="复制内容"
          >
            <Copy className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 xl:hidden"
            onClick={() => setInspectorOpen(false)}
            aria-label="关闭详情"
          >
            <X className="size-4" />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge className="border-[#cfe1d4] bg-[#edf6ef] text-[#417255]">
            {node.kind === "summary" ? "汇聚节点" : node.kind === "concept" ? "概念解释" : "AI 回答"}
          </Badge>
          <span className="text-[10px] text-[var(--muted-light)]">
            {formatRelativeTime(node.updatedAt)}
          </span>
        </div>
        <h1 className="font-display text-[26px] font-semibold leading-8 tracking-[-0.025em] text-[var(--ink)]">
          {node.title}
        </h1>

        {node.selectedText && (
          <div className="mt-5 rounded-2xl border border-[#e2ddcb] bg-[#f8f3df]/70 p-4">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[#897e5e]">
              <Quote className="size-3.5" /> 追问源自
            </div>
            <p className="text-xs italic leading-5 text-[#665f4c]">“{node.selectedText}”</p>
          </div>
        )}

        {node.prompt && (
          <div className="mt-5">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--muted-light)]">
              你的问题
            </div>
            <p className="rounded-2xl bg-black/[0.035] px-4 py-3 text-sm leading-6 text-[var(--ink)]">
              {node.prompt}
            </p>
          </div>
        )}

        <div className="mt-6 border-t border-[var(--border)] pt-5" onMouseUp={captureSelection}>
          {node.status === "streaming" && !node.content ? (
            <div className="space-y-3 py-2">
              <div className="h-3 w-2/3 animate-pulse rounded bg-black/10" />
              <div className="h-3 w-full animate-pulse rounded bg-black/[0.07]" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-black/[0.07]" />
            </div>
          ) : (
            <Markdown>{node.content}</Markdown>
          )}
        </div>

        {node.summary && (
          <div className="mt-7 rounded-2xl border border-[#d7e6da] bg-[#edf5ee] p-4">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[#4d775b]">
              <CheckCircle2 className="size-3.5" /> 带回主线
            </div>
            <p className="text-xs leading-5 text-[#42634d]">{node.summary}</p>
          </div>
        )}

        <section className="mt-7">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--muted-light)]">
              图谱关系
            </span>
            <Network className="size-3.5 text-[var(--muted-light)]" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <RelationStat icon={GitBranch} value={incoming.length} label="上游来源" />
            <RelationStat icon={Link2} value={outgoing.length} label="下游连接" />
          </div>
        </section>

        <div className="mt-7 flex items-center gap-2 border-t border-[var(--border)] pt-5">
          <Braces className="size-3.5 text-[var(--muted-light)]" />
          <span className="truncate font-mono text-[10px] text-[var(--muted-light)]">
            {node.id}
          </span>
          <span className="ml-auto text-[10px] text-[var(--muted-light)]">
            {node.provider || "manual"}
          </span>
        </div>
      </div>

      <footer className="shrink-0 border-t border-[var(--border)] bg-white/55 p-4">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Button
            variant="default"
            onClick={() => openComposer()}
            className="justify-start"
          >
            <MessageSquarePlus className="size-4" /> 从这里继续追问
          </Button>
          <Button
            variant={isReferenced ? "soft" : "outline"}
            size="icon"
            onClick={() => toggleReference(node.id)}
            aria-label={isReferenced ? "取消引用" : "加入联合提问"}
          >
            <Link2 className="size-4" />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className={cn("mt-2 w-full text-[var(--muted-light)] hover:text-red-600")}
          onClick={() => onDelete(node.id)}
        >
          <Trash2 className="size-3.5" /> 删除这个节点
        </Button>
      </footer>
    </aside>
  );
}

function RelationStat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof GitBranch;
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white/60 p-3">
      <div className="mb-1 flex items-center gap-2">
        <Icon className="size-3.5 text-[var(--muted-light)]" />
        <strong className="font-display text-lg text-[var(--ink)]">{value}</strong>
      </div>
      <span className="text-[10px] text-[var(--muted-light)]">{label}</span>
    </div>
  );
}
