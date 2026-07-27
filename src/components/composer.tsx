import { useEffect, useRef, useState } from "react";
import {
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

export function Composer({
  document,
  settings,
  onEvent,
}: {
  document: GraphDocument;
  settings: ProviderSettings;
  onEvent: (event: RunStreamEvent) => void;
}) {
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
  const controllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectedNode = document.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const references = document.nodes.filter((node) => referenceNodeIds.includes(node.id));

  useEffect(() => {
    if (composerOpen) setTimeout(() => textareaRef.current?.focus(), 40);
  }, [composerOpen]);

  const submit = async () => {
    const text = prompt.trim();
    if (!text || isRunning) return;
    setIsRunning(true);
    setActivity("正在编译图谱上下文");
    controllerRef.current = new AbortController();

    const position = getNewNodePosition(document, selectedNode);
    try {
      await api.run(
        {
          graphId: document.graph.id,
          parentNodeId: selectedNode?.id ?? null,
          referenceNodeIds,
          prompt: text,
          selectedText,
          position,
          mode,
        },
        (event) => {
          if (event.type === "tool_started") setActivity(event.label);
          if (event.type === "text_delta") setActivity("正在组织回答");
          onEvent(event);
        },
        controllerRef.current.signal,
      );
      setPrompt("");
      clearReferences();
      closeComposer();
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        onEvent({
          type: "run_failed",
          message: error instanceof Error ? error.message : "请求失败",
        });
      }
    } finally {
      setIsRunning(false);
      setActivity("");
      controllerRef.current = null;
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
          "pointer-events-auto rounded-[22px] border border-white/90 bg-[#fffefb]/94 p-2 shadow-[0_18px_60px_rgba(40,45,39,0.16)] backdrop-blur-xl transition",
          composerOpen && "p-3",
        )}
        onClick={() => !composerOpen && openComposer()}
      >
        {composerOpen && (
          <div className="mb-2.5 flex flex-wrap items-center gap-1.5 px-1">
            {selectedNode ? (
              <ContextChip icon={GitBranch} label={`主线：${selectedNode.title}`} />
            ) : (
              <ContextChip icon={Sparkles} label="新的学习起点" />
            )}
            {references.map((node) => (
              <ContextChip key={node.id} icon={Link2} label={node.title} accent />
            ))}
            {selectedText && <ContextChip icon={Quote} label={`“${selectedText.slice(0, 32)}${selectedText.length > 32 ? "…" : ""}”`} quote />}
            <button
              className="ml-auto grid size-7 place-items-center rounded-lg text-[var(--muted-light)] hover:bg-black/5 hover:text-[var(--ink)]"
              onClick={closeComposer}
              aria-label="收起输入框"
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
                "block w-full resize-none bg-transparent px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none placeholder:text-[#a4a39b]",
                !composerOpen && "h-10 py-2.5",
              )}
              placeholder={
                selectedNode
                  ? "从当前节点继续追问，或选中回答中的文字…"
                  : "开始探索一个你想真正理解的问题…"
              }
              aria-label="向 Graph Chat 提问"
              data-testid="composer-input"
            />

            {composerOpen && (
              <div className="flex items-center gap-1 px-2 pb-0.5">
                <ModeButton
                  active={mode === "answer"}
                  icon={MessageCircle}
                  label="快速回答"
                  onClick={() => setMode("answer")}
                />
                <ModeButton
                  active={mode === "explore"}
                  icon={Search}
                  label="探索图谱"
                  onClick={() => setMode("explore")}
                />
                <ModeButton
                  active={mode === "synthesize"}
                  icon={Merge}
                  label="汇聚分支"
                  onClick={() => setMode("synthesize")}
                />
                <div className="ml-auto hidden items-center gap-1.5 text-[9px] text-[var(--muted-light)] sm:flex">
                  <BrainCircuit className="size-3" />
                  {settings.provider === "demo" ? "Pi · 本地演示" : `Pi · ${settings.model}`}
                </div>
              </div>
            )}
          </div>
          {isRunning ? (
            <Button
              size="icon"
              variant="outline"
              className="mb-0.5 size-10 rounded-xl border-red-200 text-red-600"
              onClick={() => controllerRef.current?.abort()}
              aria-label="停止生成"
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
              aria-label="发送"
              data-testid="composer-submit"
            >
              <ArrowUp className="size-4" />
            </Button>
          )}
        </div>
        {isRunning && (
          <div className="mx-3 mt-1 flex items-center gap-2 border-t border-black/[0.055] pt-2 text-[10px] text-[#4f795d]">
            <LoaderCircle className="size-3 animate-spin" />
            {activity}
          </div>
        )}
      </div>
      {!composerOpen && (
        <div className="mt-2 text-center text-[9px] text-[var(--muted-light)]">
          Enter 发送 · Shift + Enter 换行
        </div>
      )}
    </div>
  );
}

function getNewNodePosition(document: GraphDocument, parent: GraphNode | null) {
  if (!parent) {
    const maxX = Math.max(0, ...document.nodes.map((node) => node.x));
    return { x: maxX + 360, y: 180 };
  }
  const childCount = document.edges.filter(
    (edge) => edge.source === parent.id && edge.kind === "branch",
  ).length;
  return {
    x: parent.x + 370,
    y: parent.y + (childCount === 0 ? 0 : childCount % 2 === 0 ? 180 : -180),
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
        "flex max-w-[230px] items-center gap-1.5 rounded-lg bg-black/[0.045] px-2 py-1 text-[9px] font-medium text-[var(--muted)]",
        accent && "bg-[#eee9f6] text-[#6c5d84]",
        quote && "bg-[#f7f0d9] text-[#776a46]",
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
        "flex h-7 items-center gap-1.5 rounded-lg px-2 text-[9px] font-semibold transition",
        active
          ? "bg-[var(--ink)] text-white"
          : "text-[var(--muted-light)] hover:bg-black/[0.04] hover:text-[var(--ink)]",
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className="size-3" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
