import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  ArrowDown,
  BookOpen,
  Cpu,
  GitBranch,
  Lightbulb,
  LoaderCircle,
  Merge,
  MessageCircleQuestion,
  Sparkles,
  StickyNote,
} from "lucide-react";
import type { GraphNode } from "@shared/types";
import { cn } from "@/lib/utils";
import { useI18n, type TranslationKey } from "@/i18n";

export type GraphNodeData = {
  node: GraphNode;
  dimmed: boolean;
  referenced: boolean;
  relationKind: "branch" | "continuation" | null;
  [key: string]: unknown;
};

const kindMeta = {
  question: { label: "node.question", icon: MessageCircleQuestion, color: "blue" },
  answer: { label: "node.answer", icon: BookOpen, color: "green" },
  concept: { label: "node.concept", icon: Lightbulb, color: "amber" },
  summary: { label: "node.summary", icon: Merge, color: "violet" },
  note: { label: "node.note", icon: StickyNote, color: "stone" },
} as const;

export function GraphNodeCard({ data, selected }: NodeProps) {
  const { t } = useI18n();
  const { node, dimmed, referenced, relationKind } = data as GraphNodeData;
  const meta = kindMeta[node.kind];
  const Icon = meta.icon;
  const RelationIcon =
    relationKind === "branch"
      ? GitBranch
      : relationKind === "continuation"
        ? ArrowDown
        : Sparkles;
  const isStreaming = node.status === "streaming";
  const isCancelled = node.status === "cancelled";
  const isError = node.status === "error";
  return (
    <article
      data-testid={`graph-node-${node.id}`}
      className={cn(
        "graph-node group relative w-[304px] overflow-hidden rounded-xl border bg-[var(--surface)]/95 p-3.5 shadow-[var(--shadow-sm)] backdrop-blur transition duration-200",
        `node-${meta.color}`,
        selected && "is-selected",
        referenced && "is-referenced",
        dimmed && "opacity-25 grayscale",
      )}
    >
      <Handle type="target" position={Position.Top} className="graph-handle" />
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="node-kind-icon">
            <Icon className="size-3.5" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted-light)]">
            {t(meta.label as TranslationKey)}
          </span>
        </div>
        {isStreaming ? (
          <span className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--accent)]">
            <LoaderCircle className="size-3 animate-spin" /> {t("node.thinking")}
          </span>
        ) : isCancelled || isError ? (
          <span className="text-[10px] font-medium text-[var(--danger)]">
            {isCancelled ? t("node.cancelled") : t("node.failed")}
          </span>
        ) : (
          <span
            className={cn(
              "flex h-5 items-center gap-1 rounded-md px-1.5 text-[8px] font-semibold",
              relationKind === "branch"
                ? "bg-[var(--accent-soft)] text-[var(--accent-fg)]"
                : relationKind === "continuation"
                  ? "bg-[var(--paper-deep)] text-[var(--muted)]"
                  : "bg-[var(--paper-deep)] text-[var(--muted-light)]",
            )}
          >
            <RelationIcon className="size-2.5" />
            {relationKind === "branch"
              ? t("edge.branch")
              : relationKind === "continuation"
                ? t("edge.continue")
                : t("relation.start")}
          </span>
        )}
      </div>
      <h3 className="mb-1.5 line-clamp-2 font-display text-[15px] font-semibold leading-[19px] text-[var(--ink)]">
        {node.title}
      </h3>
      <p className="line-clamp-3 min-h-12 text-[11px] leading-4 text-[var(--muted)]">
        {node.summary ||
          node.content ||
          (isCancelled ? t("node.cancelledBody") : t("node.waiting"))}
      </p>
      <div className="mt-2.5 flex items-center justify-between border-t border-[var(--border)] pt-2.5">
        <span className="flex items-center gap-1 text-[10px] text-[var(--muted-light)]">
          <Cpu className="size-3" />
          {node.model || t("node.manualNote")}
        </span>
        {referenced && (
          <span className="rounded-md bg-[var(--accent-soft)] px-2 py-0.5 text-[9px] font-semibold text-[var(--accent-fg)]">
            {t("node.referenced")}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="graph-handle" />
    </article>
  );
}
