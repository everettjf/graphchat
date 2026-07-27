import { Handle, Position, type NodeProps } from "@xyflow/react";
import { BookOpen, Check, GitBranch, Lightbulb, LoaderCircle, Merge, MessageCircleQuestion, StickyNote } from "lucide-react";
import type { GraphNode } from "@shared/types";
import { cn } from "@/lib/utils";

export type GraphNodeData = {
  node: GraphNode;
  dimmed: boolean;
  referenced: boolean;
  [key: string]: unknown;
};

const kindMeta = {
  question: { label: "问题", icon: MessageCircleQuestion, color: "blue" },
  answer: { label: "回答", icon: BookOpen, color: "green" },
  concept: { label: "概念", icon: Lightbulb, color: "amber" },
  summary: { label: "汇聚", icon: Merge, color: "violet" },
  note: { label: "笔记", icon: StickyNote, color: "stone" },
} as const;

export function GraphNodeCard({ data, selected }: NodeProps) {
  const { node, dimmed, referenced } = data as GraphNodeData;
  const meta = kindMeta[node.kind];
  const Icon = meta.icon;
  const isStreaming = node.status === "streaming";
  return (
    <article
      data-testid={`graph-node-${node.id}`}
      className={cn(
        "graph-node group relative w-[282px] rounded-[20px] border bg-white/92 p-4 shadow-[0_12px_35px_rgba(44,48,42,0.08)] backdrop-blur transition duration-200",
        `node-${meta.color}`,
        selected && "is-selected",
        referenced && "is-referenced",
        dimmed && "opacity-25 grayscale",
      )}
    >
      <Handle type="target" position={Position.Left} className="graph-handle" />
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="node-kind-icon">
            <Icon className="size-3.5" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted-light)]">
            {meta.label}
          </span>
        </div>
        {isStreaming ? (
          <span className="flex items-center gap-1.5 text-[10px] font-medium text-[#397b55]">
            <LoaderCircle className="size-3 animate-spin" /> 正在思考
          </span>
        ) : (
          <Check className="size-3.5 text-[#8fb59e] opacity-0 transition group-hover:opacity-100" />
        )}
      </div>
      <h3 className="mb-2 line-clamp-2 font-display text-[16px] font-semibold leading-5 text-[var(--ink)]">
        {node.title}
      </h3>
      <p className="line-clamp-3 min-h-[54px] text-xs leading-[18px] text-[var(--muted)]">
        {node.summary || node.content || "等待回答…"}
      </p>
      <div className="mt-3 flex items-center justify-between border-t border-black/[0.055] pt-3">
        <span className="flex items-center gap-1 text-[10px] text-[var(--muted-light)]">
          <GitBranch className="size-3" />
          {node.provider === "demo" ? "本地演示" : node.model || "手动笔记"}
        </span>
        {referenced && (
          <span className="rounded-full bg-[#e3f1e7] px-2 py-0.5 text-[9px] font-bold text-[#397b55]">
            已引用
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="graph-handle" />
    </article>
  );
}
