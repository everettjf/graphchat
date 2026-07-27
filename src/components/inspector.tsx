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
import { useI18n } from "@/i18n";

export function Inspector({
  node,
  document,
  onDelete,
}: {
  node: GraphNode | null;
  document: GraphDocument;
  onDelete: (id: string) => void;
}) {
  const { locale, t } = useI18n();
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
      className="inspector-shell z-20 flex h-full w-[382px] shrink-0 flex-col border-l border-[var(--border)] bg-[#fbfaf6]/94 backdrop-blur-xl max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:shadow-2xl max-sm:w-full"
      data-testid="node-inspector"
    >
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--border)] px-5">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={t("inspector.close")}
            onClick={() => setInspectorOpen(false)}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <span className="text-xs font-semibold text-[var(--muted)]">
            {t("inspector.title")}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => void navigator.clipboard.writeText(node.content)}
            aria-label={t("inspector.copy")}
          >
            <Copy className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 xl:hidden"
            onClick={() => setInspectorOpen(false)}
            aria-label={t("inspector.close")}
          >
            <X className="size-4" />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge className="border-[#cfe1d4] bg-[#edf6ef] text-[#417255]">
            {node.kind === "summary"
              ? t("inspector.summaryKind")
              : node.kind === "concept"
                ? t("inspector.conceptKind")
                : t("inspector.answerKind")}
          </Badge>
          <span className="text-[10px] text-[var(--muted-light)]">
            {formatRelativeTime(node.updatedAt, locale)}
          </span>
        </div>
        <h1 className="font-display text-[26px] font-semibold leading-8 tracking-[-0.025em] text-[var(--ink)]">
          {node.title}
        </h1>

        {node.selectedText && (
          <div className="mt-5 rounded-2xl border border-[#e2ddcb] bg-[#f8f3df]/70 p-4">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[#897e5e]">
              <Quote className="size-3.5" /> {t("inspector.fromSelection")}
            </div>
            <p className="text-xs italic leading-5 text-[#665f4c]">“{node.selectedText}”</p>
          </div>
        )}

        {node.prompt && (
          <div className="mt-5">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--muted-light)]">
              {t("inspector.yourQuestion")}
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
          ) : node.status === "cancelled" && !node.content ? (
            <p className="rounded-2xl bg-[#f6eee9] px-4 py-3 text-xs leading-5 text-[#865748]">
              {t("inspector.cancelledBody")}
            </p>
          ) : (
            <Markdown>{node.content}</Markdown>
          )}
        </div>

        {node.summary && (
          <div className="mt-7 rounded-2xl border border-[#d7e6da] bg-[#edf5ee] p-4">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[#4d775b]">
              <CheckCircle2 className="size-3.5" /> {t("inspector.backToMain")}
            </div>
            <p className="text-xs leading-5 text-[#42634d]">{node.summary}</p>
          </div>
        )}

        <section className="mt-7">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--muted-light)]">
              {t("inspector.relationships")}
            </span>
            <Network className="size-3.5 text-[var(--muted-light)]" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <RelationStat
              icon={GitBranch}
              value={incoming.length}
              label={t("inspector.incoming")}
            />
            <RelationStat
              icon={Link2}
              value={outgoing.length}
              label={t("inspector.outgoing")}
            />
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
            <MessageSquarePlus className="size-4" /> {t("inspector.continue")}
          </Button>
          <Button
            variant={isReferenced ? "soft" : "outline"}
            size="icon"
            onClick={() => toggleReference(node.id)}
            aria-label={
              isReferenced
                ? t("inspector.removeReference")
                : t("inspector.addReference")
            }
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
          <Trash2 className="size-3.5" /> {t("inspector.delete")}
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
