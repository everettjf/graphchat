import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Bookmark,
  Bot,
  Cpu,
  GitBranch,
  Layers,
  MessageCircleQuestion,
  Puzzle,
  Settings2,
  Wrench,
} from "lucide-react";
import type { PiTurn } from "@shared/types";
import { cn } from "@/lib/utils";
import { useI18n, type TranslationKey } from "@/i18n";

export type PiTurnData = {
  turn: PiTurn;
  dimmed: boolean;
  [key: string]: unknown;
};

export const PI_TURN_WIDTH = 304;

const kindMeta: Record<
  PiTurn["kind"],
  { icon: typeof Bot; color: string; label: TranslationKey }
> = {
  user: { icon: MessageCircleQuestion, color: "node-blue", label: "pi.kind.user" },
  assistant: { icon: Bot, color: "node-green", label: "pi.kind.assistant" },
  compaction: { icon: Layers, color: "node-violet", label: "pi.kind.compaction" },
  branch_summary: { icon: GitBranch, color: "node-violet", label: "pi.kind.branch_summary" },
  custom_message: { icon: Puzzle, color: "node-amber", label: "pi.kind.custom_message" },
  other: { icon: Settings2, color: "node-stone", label: "pi.kind.other" },
};

export function PiTurnCard({ data, selected }: NodeProps) {
  const { t } = useI18n();
  const { turn, dimmed } = data as PiTurnData;
  const meta = kindMeta[turn.kind];
  const Icon = meta.icon;
  const preview = turn.response || turn.thinking || turn.prompt;
  return (
    <article
      data-testid={`pi-turn-${turn.id}`}
      className={cn(
        "graph-node group relative w-[304px] overflow-hidden rounded-xl border bg-[var(--surface)]/95 p-3.5 shadow-[var(--shadow-sm)] backdrop-blur transition duration-200",
        meta.color,
        selected && "is-selected",
        !turn.onActivePath && "border-dashed opacity-70",
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
            {t(meta.label)}
          </span>
        </div>
        {turn.isLeaf ? (
          <span className="flex h-5 items-center gap-1 rounded-md bg-[var(--accent-soft)] px-1.5 text-[8px] font-semibold text-[var(--accent-fg)]">
            {t("pi.leaf")}
          </span>
        ) : !turn.onActivePath ? (
          <span className="flex h-5 items-center gap-1 rounded-md bg-[var(--paper-deep)] px-1.5 text-[8px] font-semibold text-[var(--muted-light)]">
            <GitBranch className="size-2.5" /> {t("pi.abandoned")}
          </span>
        ) : null}
      </div>
      <h3 className="mb-1.5 line-clamp-2 font-display text-[15px] font-semibold leading-[19px] text-[var(--ink)]">
        {turn.title}
      </h3>
      <p className="line-clamp-3 min-h-12 whitespace-pre-line text-[11px] leading-4 text-[var(--muted)]">
        {preview}
      </p>
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-2.5">
        <span className="flex min-w-0 items-center gap-1 truncate text-[10px] text-[var(--muted-light)]">
          <Cpu className="size-3 shrink-0" />
          <span className="truncate">{turn.model || "—"}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-[9px] text-[var(--muted-light)]">
          {turn.toolCalls.length > 0 && (
            <span className="flex items-center gap-0.5">
              <Wrench className="size-2.5" /> {turn.toolCalls.length}
            </span>
          )}
          {turn.label && (
            <span className="flex items-center gap-0.5 rounded-md bg-[var(--accent-soft)] px-1.5 py-0.5 font-semibold text-[var(--accent-fg)]">
              <Bookmark className="size-2.5" /> {turn.label}
            </span>
          )}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} className="graph-handle" />
    </article>
  );
}
