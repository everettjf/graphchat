import { LoaderCircle, Wrench } from "lucide-react";
import type { PiToolCall } from "@shared/types";
import { useI18n } from "@/i18n";

const MAX_TOOL_OUTPUT = 6_000;

function clip(text: string) {
  return text.length > MAX_TOOL_OUTPUT ? text.slice(0, MAX_TOOL_OUTPUT) : text;
}

export function ToolCallItem({ call, running = false }: { call: PiToolCall; running?: boolean }) {
  const { t } = useI18n();
  return (
    <details data-testid="tool-call-item" className="group rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[11px] font-medium text-[var(--ink)]">
        {running ? (
          <LoaderCircle className="size-3 animate-spin text-[var(--accent)]" />
        ) : (
          <Wrench className="size-3 text-[var(--muted-light)]" />
        )}
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
