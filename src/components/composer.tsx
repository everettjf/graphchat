import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BrainCircuit,
  CircleStop,
  GitBranch,
  Link2,
  LoaderCircle,
  Merge,
  MessageCircle,
  Quote,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import type {
  GraphDocument,
  GraphNode,
  ProviderSettings,
  RunStreamEvent,
} from "@shared/types";
import { Button } from "./ui/button";
import { useWorkspace } from "@/store/workspace";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

export function Composer({
  document,
  settings,
  onEvent,
}: {
  document: GraphDocument;
  settings: ProviderSettings;
  onEvent: (event: RunStreamEvent) => void;
}) {
  const { locale, t } = useI18n();
  const {
    selectedNodeId,
    referenceNodeIds,
    clearReferences,
    selectedText,
    composerOpen,
    openComposer,
    closeComposer,
    mode,
    setMode,
  } = useWorkspace();
  const [prompt, setPrompt] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [activity, setActivity] = useState("");
  const [relationKind, setRelationKind] = useState<"continuation" | "branch">(
    selectedText ? "branch" : "continuation",
  );
  const controllerRef = useRef<AbortController | null>(null);
  const activeRunRef = useRef<{ runId: string; nodeId: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectedNode = document.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const references = document.nodes.filter((node) => referenceNodeIds.includes(node.id));

  useEffect(() => {
    if (composerOpen) setTimeout(() => textareaRef.current?.focus(), 40);
  }, [composerOpen]);

  useEffect(() => {
    setRelationKind(selectedText ? "branch" : "continuation");
  }, [selectedText]);

  const submit = async () => {
    const text = prompt.trim();
    if (!text || isRunning) return;
    setIsRunning(true);
    setActivity(t("composer.compiling"));
    controllerRef.current = new AbortController();

    const position = getNewNodePosition(document, selectedNode);
    try {
      await api.run(
        {
          graphId: document.graph.id,
          parentNodeId: selectedNode?.id ?? null,
          relationKind,
          referenceNodeIds,
          prompt: text,
          selectedText,
          position,
          mode,
          locale,
        },
        (event) => {
          if (event.type === "run_started") {
            activeRunRef.current = { runId: event.runId, nodeId: event.nodeId };
          }
          if (event.type === "tool_started") setActivity(event.label);
          if (event.type === "text_delta") setActivity(t("composer.organizing"));
          onEvent(event);
        },
        controllerRef.current.signal,
      );
      setPrompt("");
      clearReferences();
      closeComposer();
    } catch (error) {
      if ((error as Error).name === "AbortError" && activeRunRef.current) {
        onEvent({
          type: "run_cancelled",
          ...activeRunRef.current,
          message: t("app.cancelled"),
        });
      } else if ((error as Error).name !== "AbortError") {
        onEvent({
          type: "run_failed",
          runId: activeRunRef.current?.runId ?? null,
          nodeId: activeRunRef.current?.nodeId ?? null,
          message: error instanceof Error ? error.message : t("app.requestFailed"),
        });
      }
    } finally {
      setIsRunning(false);
      setActivity("");
      controllerRef.current = null;
      activeRunRef.current = null;
    }
  };

  return (
    <div
      className={cn(
        "composer-shell pointer-events-none absolute bottom-5 left-1/2 z-10 w-[min(720px,calc(100%-32px))] -translate-x-1/2 transition-all duration-200",
        composerOpen && "w-[min(780px,calc(100%-24px))]",
      )}
    >
      <div
        className={cn(
          "pointer-events-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]/95 p-2 shadow-[var(--shadow-lg)] backdrop-blur-xl transition",
          composerOpen && "p-3",
        )}
        onClick={() => !composerOpen && openComposer()}
      >
        {composerOpen && (
          <div className="mb-2.5 flex flex-wrap items-center gap-1.5 px-1">
            {selectedNode ? (
              <ContextChip
                icon={GitBranch}
                label={t("composer.mainPath", { title: selectedNode.title })}
              />
            ) : (
              <ContextChip icon={Sparkles} label={t("composer.newStart")} />
            )}
            {references.map((node) => (
              <ContextChip key={node.id} icon={Link2} label={node.title} accent />
            ))}
            {selectedText && (
              <span data-testid="selection-context">
                <ContextChip icon={Quote} label={`“${selectedText.slice(0, 32)}${selectedText.length > 32 ? "…" : ""}”`} quote />
              </span>
            )}
            {selectedNode && (
              <div className="flex rounded-lg bg-[var(--paper-deep)] p-0.5">
                <button
                  type="button"
                  className={cn(
                    "flex h-6 items-center gap-1 rounded-md px-2 text-[9px] font-medium",
                    relationKind === "continuation"
                      ? "bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-xs)]"
                      : "text-[var(--muted)]",
                  )}
                  onClick={() => setRelationKind("continuation")}
                >
                  <ArrowDown className="size-3" /> {t("edge.continue")}
                </button>
                <button
                  type="button"
                  className={cn(
                    "flex h-6 items-center gap-1 rounded-md px-2 text-[9px] font-medium",
                    relationKind === "branch"
                      ? "bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-xs)]"
                      : "text-[var(--muted)]",
                  )}
                  onClick={() => setRelationKind("branch")}
                >
                  <GitBranch className="size-3" /> {t("edge.branch")}
                </button>
              </div>
            )}
            <button
              className="ml-auto grid size-7 place-items-center rounded-lg text-[var(--muted-light)] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
              onClick={closeComposer}
              aria-label={t("composer.collapse")}
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onFocus={() => openComposer(selectedText)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
              rows={composerOpen ? 3 : 1}
              className={cn(
                "block w-full resize-none bg-transparent px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none placeholder:text-[var(--muted-light)]",
                !composerOpen && "h-10 py-2.5",
              )}
              placeholder={
                selectedNode
                  ? t("composer.followPlaceholder")
                  : t("composer.startPlaceholder")
              }
              aria-label={t("composer.askLabel")}
              data-testid="composer-input"
            />

            {composerOpen && (
              <div className="flex min-w-0 items-center gap-1 overflow-x-auto px-2 pb-0.5">
                <ModeButton
                  active={mode === "answer"}
                  icon={MessageCircle}
                  label={t("composer.quick")}
                  onClick={() => setMode("answer")}
                />
                <ModeButton
                  active={mode === "explore"}
                  icon={Search}
                  label={t("composer.explore")}
                  onClick={() => setMode("explore")}
                />
                <ModeButton
                  active={mode === "synthesize"}
                  icon={Merge}
                  label={t("composer.synthesize")}
                  onClick={() => setMode("synthesize")}
                />
                <div className="ml-auto hidden shrink-0 items-center gap-1.5 text-[9px] text-[var(--muted-light)] xl:flex">
                  <BrainCircuit className="size-3" />
                  {`Pi · ${settings.model}`}
                </div>
              </div>
            )}
          </div>
          {isRunning ? (
            <Button
              size="icon"
              variant="outline"
              className="mb-0.5 size-10 rounded-xl border-[var(--danger-border)] text-[var(--danger)] hover:border-[var(--danger-border)]"
              onClick={() => {
                const activeRun = activeRunRef.current;
                if (activeRun) void api.cancelRun(activeRun.nodeId);
                controllerRef.current?.abort();
              }}
              aria-label={t("composer.stop")}
            >
              <CircleStop className="size-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              variant="accent"
              className="mb-0.5 size-10 rounded-xl"
              disabled={!prompt.trim()}
              onClick={() => void submit()}
              aria-label={t("composer.send")}
              data-testid="composer-submit"
            >
              <ArrowUp className="size-4" />
            </Button>
          )}
        </div>
        {isRunning && (
          <div className="mx-3 mt-1 flex items-center gap-2 border-t border-[var(--border)] pt-2 text-[10px] text-[var(--accent-fg)]">
            <LoaderCircle className="size-3 animate-spin" />
            {activity}
          </div>
        )}
      </div>
      {!composerOpen && (
        <div className="mt-2 text-center text-[9px] text-[var(--muted-light)]">
          {t("composer.shortcut")}
        </div>
      )}
    </div>
  );
}

function getNewNodePosition(document: GraphDocument, parent: GraphNode | null) {
  if (!parent) {
    const incoming = new Set(
      document.edges
        .filter(
          (edge) =>
            edge.kind === "branch" || edge.kind === "continuation",
        )
        .map((edge) => edge.target),
    );
    const rootCount = document.nodes.filter(
      (node) => !incoming.has(node.id),
    ).length;
    return { x: 120 + rootCount * 376, y: 100 };
  }
  const childCount = document.edges.filter(
    (edge) =>
      edge.source === parent.id &&
      (edge.kind === "branch" || edge.kind === "continuation"),
  ).length;
  const siblingLane =
    childCount === 0
      ? 0
      : Math.ceil(childCount / 2) * (childCount % 2 === 1 ? -1 : 1);
  return {
    x: parent.x + siblingLane * 376,
    y: parent.y + 236,
  };
}

function ContextChip({
  icon: Icon,
  label,
  accent,
  quote,
}: {
  icon: typeof GitBranch;
  label: string;
  accent?: boolean;
  quote?: boolean;
}) {
  return (
    <span
      className={cn(
        "flex max-w-[230px] items-center gap-1.5 rounded-lg bg-[var(--paper-deep)] px-2 py-1 text-[9px] font-medium text-[var(--muted)]",
        accent && "bg-[var(--ref-soft)] text-[var(--ref)]",
        quote && "bg-[var(--paper-deep)] text-[var(--muted)]",
      )}
    >
      <Icon className="size-3 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

function ModeButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof MessageCircle;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-[9px] font-semibold leading-none transition",
        active
          ? "bg-[var(--ink)] text-[var(--accent-contrast)]"
          : "text-[var(--muted-light)] hover:bg-[var(--hover)] hover:text-[var(--ink)]",
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className="size-3 shrink-0" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
