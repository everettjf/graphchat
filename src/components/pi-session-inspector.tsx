import { Bookmark, Bot, Brain, Copy, Cpu, GitBranch, Wrench } from "lucide-react";
import type { PiSessionTree, PiToolCall, PiTurn } from "@shared/types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Markdown } from "./markdown";
import { useI18n, type TranslationKey } from "@/i18n";
import { cn, formatRelativeTime } from "@/lib/utils";

const MAX_TOOL_OUTPUT = 6_000;

const kindLabels: Record<PiTurn["kind"], TranslationKey> = {
  user: "pi.kind.user",
  assistant: "pi.kind.assistant",
  compaction: "pi.kind.compaction",
  branch_summary: "pi.kind.branch_summary",
  custom_message: "pi.kind.custom_message",
  other: "pi.kind.other",
};

function clip(text: string) {
  return text.length > MAX_TOOL_OUTPUT ? text.slice(0, MAX_TOOL_OUTPUT) : text;
}

function ToolCallItem({ call }: { call: PiToolCall }) {
  const { t } = useI18n();
  return (
    <details className="group rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[11px] font-medium text-[var(--ink)]">
        <Wrench className="size-3 text-[var(--muted-light)]" />
        <code className="font-mono text-[11px]">{call.name}</code>
        {call.isError && (
          <span className="rounded-md bg-[var(--danger-soft)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--danger)]">
            error
          </span>
        )}
        <span className="ml-auto truncate text-[9px] text-[var(--muted-light)]">
          {call.arguments.replace(/\s+/g, " ").slice(0, 60)}
        </span>
      </summary>
      <div className="space-y-2 border-t border-[var(--border)] px-3 py-2.5">
        {call.arguments && (
          <div>
            <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.13em] text-[var(--muted-light)]">
              {t("pi.arguments")}
            </div>
            <pre className="max-h-64 overflow-auto rounded-md bg-[var(--paper-deep)] p-2 text-[10.5px] leading-4">
              {clip(call.arguments)}
            </pre>
          </div>
        )}
        <div>
          <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.13em] text-[var(--muted-light)]">
            {t("pi.result")}
          </div>
          <pre className="max-h-72 overflow-auto rounded-md bg-[var(--paper-deep)] p-2 text-[10.5px] leading-4">
            {call.result ? clip(call.result) : t("pi.noOutput")}
          </pre>
          {call.result.length > MAX_TOOL_OUTPUT && (
            <p className="mt-1 text-[9px] text-[var(--muted-light)]">{t("pi.truncated")}</p>
          )}
        </div>
      </div>
    </details>
  );
}

export function PiSessionInspector({
  tree,
  turn,
}: {
  tree: PiSessionTree;
  turn: PiTurn | null;
}) {
  const { locale, t } = useI18n();

  return (
    <aside
      className="inspector-shell z-20 flex h-full min-w-0 flex-col border-l border-[var(--border)] bg-[var(--surface)]/94 backdrop-blur-xl"
      data-testid="pi-inspector"
    >
      {!turn ? (
        <div className="grid h-full place-items-center px-6 text-center text-xs leading-5 text-[var(--muted)]">
          {t("pi.selectTurn")}
        </div>
      ) : (
        <>
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-5">
            <div className="flex min-w-0 items-center gap-2">
              <Badge className="border-[var(--accent-ring)] bg-[var(--accent-soft)] text-[var(--accent-fg)]">
                {t(kindLabels[turn.kind])}
              </Badge>
              {turn.isLeaf ? (
                <Badge>{t("pi.leaf")}</Badge>
              ) : turn.onActivePath ? (
                <Badge>{t("pi.activePath")}</Badge>
              ) : (
                <Badge className="text-[var(--muted-light)]">
                  <GitBranch className="mr-1 size-2.5" /> {t("pi.abandoned")}
                </Badge>
              )}
              <span className="truncate text-[10px] text-[var(--muted-light)]">
                {formatRelativeTime(turn.timestamp, locale)}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={t("inspector.copy")}
              onClick={() =>
                void navigator.clipboard.writeText(
                  [turn.prompt, turn.response].filter(Boolean).join("\n\n"),
                )
              }
            >
              <Copy className="size-3.5" />
            </Button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            <h1 className="font-display text-[22px] font-semibold leading-7 tracking-[-0.02em] text-[var(--ink)]">
              {turn.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-[var(--muted-light)]">
              <span className="flex items-center gap-1">
                <Cpu className="size-3" /> {turn.model || "—"}
                {turn.provider ? ` · ${turn.provider}` : ""}
              </span>
              {turn.label && (
                <span className="flex items-center gap-1 text-[var(--accent-fg)]">
                  <Bookmark className="size-3" /> {turn.label}
                </span>
              )}
              <span className="font-mono">{turn.entryIds.join(" · ")}</span>
            </div>

            {turn.prompt && (
              <section className="mt-6">
                <SectionTitle>{t("pi.prompt")}</SectionTitle>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--paper-deep)] p-4 shadow-[var(--shadow-xs)]">
                  <Markdown className="text-[13px] leading-6">{turn.prompt}</Markdown>
                </div>
              </section>
            )}

            {turn.thinking && (
              <details className="mt-5 rounded-xl border border-dashed border-[var(--border)] px-4 py-3">
                <summary className="flex cursor-pointer items-center gap-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--muted-light)]">
                  <Brain className="size-3.5" /> {t("pi.thinking")}
                </summary>
                <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-[var(--muted)]">
                  {turn.thinking}
                </p>
              </details>
            )}

            {turn.toolCalls.length > 0 && (
              <section className="mt-6">
                <SectionTitle>
                  {t("pi.toolCalls")} · {turn.toolCalls.length}
                </SectionTitle>
                <div className="space-y-1.5">
                  {turn.toolCalls.map((call) => (
                    <ToolCallItem key={call.id} call={call} />
                  ))}
                </div>
              </section>
            )}

            {turn.response && (
              <section className="mt-6">
                <SectionTitle>
                  <Bot className="size-3.5" /> {t("pi.response")}
                </SectionTitle>
                <Markdown className="text-[13.5px] leading-6">{turn.response}</Markdown>
              </section>
            )}

            <section className="mt-8 border-t border-[var(--border)] pt-4 text-[10px] text-[var(--muted-light)]">
              <div className="font-bold uppercase tracking-[0.13em]">{t("pi.sessionFile")}</div>
              <code className={cn("mt-1 block break-all font-mono text-[10px]")}>{tree.session.path}</code>
            </section>
          </div>
        </>
      )}
    </aside>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--muted-light)]">
      {children}
    </div>
  );
}
