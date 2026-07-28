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
  ThumbsDown,
  ThumbsUp,
  WandSparkles,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { GraphDocument, GraphNode, UpdateNodeInput } from "@shared/types";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Markdown } from "./markdown";
import { useWorkspace } from "@/store/workspace";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { stripTrailingMainThreadSection } from "@shared/answer-content";

export function Inspector({
  node,
  document,
  onUpdate,
  embedded = false,
}: {
  node: GraphNode | null;
  document: GraphDocument;
  onUpdate: (id: string, input: UpdateNodeInput) => void;
  embedded?: boolean;
}) {
  const { locale, t } = useI18n();
  const {
    referenceNodeIds,
    toggleReference,
    openComposer,
    setInspectorOpen,
    inspectorOpen,
  } = useWorkspace();
  const [activeTab, setActiveTab] = useState<
    "conversation" | "details" | "context"
  >("conversation");

  useEffect(() => {
    setActiveTab("conversation");
  }, [node?.id]);

  if (!node || (!embedded && !inspectorOpen)) return null;
  const incoming = document.edges.filter((edge) => edge.target === node.id);
  const outgoing = document.edges.filter((edge) => edge.source === node.id);
  const isReferenced = referenceNodeIds.includes(node.id);
  const conversationContent = stripTrailingMainThreadSection(node.content);

  const captureSelection = () => {
    const selection = window.getSelection()?.toString().trim();
    if (selection && selection.length <= 1_500) openComposer(selection);
  };

  return (
    <aside
      className={cn(
        "z-20 flex h-full flex-col bg-[#fbfaf6]/94 backdrop-blur-xl",
        embedded
          ? "content-shell min-w-0 flex-1"
          : "inspector-shell w-[382px] shrink-0 border-l border-[var(--border)] max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:shadow-2xl max-sm:w-full",
      )}
      data-testid="node-inspector"
    >
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-5">
        <div className="flex items-center gap-2">
          {!embedded && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={t("inspector.close")}
              onClick={() => setInspectorOpen(false)}
            >
              <ArrowLeft className="size-4" />
            </Button>
          )}
          <span className="text-xs font-semibold text-[var(--muted)]">
            {t("inspector.title")}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => void navigator.clipboard.writeText(conversationContent)}
            aria-label={t("inspector.copy")}
          >
            <Copy className="size-3.5" />
          </Button>
          {!embedded && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 xl:hidden"
              onClick={() => setInspectorOpen(false)}
              aria-label={t("inspector.close")}
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      </header>

      <div className={cn("min-h-0 flex-1 overflow-y-auto px-6 py-6", embedded && "px-[clamp(24px,6vw,88px)]")}>
        <div className={cn(embedded && "mx-auto w-full max-w-[820px]")}>
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

        {embedded && (
          <div
            className="mt-5 flex gap-1 border-b border-[var(--border)]"
            role="tablist"
            aria-label={locale === "zh" ? "内容面板" : "Content panel"}
          >
            {[
              ["conversation", locale === "zh" ? "对话" : "Conversation"],
              ["details", locale === "zh" ? "详情" : "Details"],
              ["context", locale === "zh" ? "上下文" : "Context"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                data-testid={`content-tab-${id}`}
                className={cn(
                  "-mb-px border-b-2 border-transparent px-3 py-2 text-[11px] font-medium text-[var(--muted)] transition",
                  activeTab === id && "border-[#668b72] text-[#45614d]",
                )}
                onClick={() =>
                  setActiveTab(id as "conversation" | "details" | "context")
                }
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {activeTab === "conversation" && (
          <>
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

        <div
          className="mt-6 border-t border-[var(--border)] pt-5"
          onMouseUp={captureSelection}
          data-testid="conversation-content"
        >
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
            <Markdown>{conversationContent}</Markdown>
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
          </>
        )}

        {activeTab === "context" && node.contextSnapshot && (
          <section className="mt-7 rounded-2xl border border-[#ddd7e8] bg-[#f4f0f8] p-4">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[#6d6282]">
              <Braces className="size-3.5" />
              {locale === "zh" ? "实际使用的上下文" : "Context actually used"}
            </div>
            <p className="mb-3 text-[10px] text-[#756b86]">
              {locale === "zh"
                ? `约 ${node.contextSnapshot.estimatedTokens} tokens · ${node.contextSnapshot.items.length} 个来源`
                : `~${node.contextSnapshot.estimatedTokens} tokens · ${node.contextSnapshot.items.length} sources`}
            </p>
            <div className="space-y-1.5">
              {node.contextSnapshot.items.map((item) => (
                <div key={`${item.nodeId}-${item.reason}`} className="flex items-center gap-2 rounded-lg bg-white/55 px-2.5 py-2">
                  <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-[#5e556e]">
                    {item.title}
                  </span>
                  <span className="rounded-full bg-[#e8e0f0] px-2 py-0.5 text-[8px] uppercase text-[#6d6282]">
                    {item.reason}
                  </span>
                </div>
              ))}
            </div>
            {node.contextSnapshot.omittedNodeIds.length > 0 && (
              <p className="mt-2 text-[9px] text-[#8b6270]">
                {locale === "zh"
                  ? `${node.contextSnapshot.omittedNodeIds.length} 个节点因上下文预算未使用`
                  : `${node.contextSnapshot.omittedNodeIds.length} nodes omitted by the context budget`}
              </p>
            )}
          </section>
        )}
        {activeTab === "context" && !node.contextSnapshot && (
          <div className="mt-7 rounded-2xl border border-dashed border-[var(--border)] p-6 text-center text-xs leading-5 text-[var(--muted)]">
            {locale === "zh"
              ? "这个节点没有保存模型上下文。手工笔记和旧节点通常不会包含上下文快照。"
              : "This node has no saved model context. Manual notes and legacy nodes usually do not include a context snapshot."}
          </div>
        )}

        {activeTab === "details" && (
          <>
        <section className="mt-7 border-t border-[var(--border)] pt-5">
          <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--muted-light)]">
            {locale === "zh" ? "知识资产" : "Knowledge asset"}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mb-3 w-full"
            onClick={async () => {
              const suggestion = await api.suggestMetadata(node.id);
              onUpdate(node.id, suggestion);
            }}
          >
            <WandSparkles className="size-3.5" />
            {locale === "zh" ? "建议标签与摘要" : "Suggest tags and summary"}
          </Button>
          <label className="mb-3 block text-[10px] text-[var(--muted-light)]">
            {locale === "zh" ? "标签（逗号分隔）" : "Tags (comma separated)"}
            <input
              key={`${node.id}-${node.tags.join(",")}`}
              defaultValue={node.tags.join(", ")}
              onBlur={(event) =>
                onUpdate(node.id, {
                  tags: event.currentTarget.value
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                })
              }
              className="mt-1 h-9 w-full rounded-xl border border-[var(--border)] bg-white/70 px-3 text-xs outline-none focus:border-[#8fb59e]"
            />
          </label>
          <label className="mb-3 block text-[10px] text-[var(--muted-light)]">
            {locale === "zh" ? "来源链接" : "Source URL"}
            <input
              key={`${node.id}-${node.sourceUrl}`}
              defaultValue={node.sourceUrl}
              onBlur={(event) => onUpdate(node.id, { sourceUrl: event.currentTarget.value.trim() })}
              className="mt-1 h-9 w-full rounded-xl border border-[var(--border)] bg-white/70 px-3 text-xs outline-none focus:border-[#8fb59e]"
            />
          </label>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <select
              value={node.knowledgeStatus}
              onChange={(event) =>
                onUpdate(node.id, {
                  knowledgeStatus: event.target.value as GraphNode["knowledgeStatus"],
                })
              }
              aria-label={locale === "zh" ? "知识状态" : "Knowledge status"}
              className="h-9 rounded-xl border border-[var(--border)] bg-white/70 px-2 text-[10px]"
            >
              <option value="exploring">{locale === "zh" ? "探索中" : "Exploring"}</option>
              <option value="verified">{locale === "zh" ? "已验证" : "Verified"}</option>
              <option value="conclusion">{locale === "zh" ? "结论" : "Conclusion"}</option>
              <option value="outdated">{locale === "zh" ? "已过时" : "Outdated"}</option>
            </select>
            <select
              value={node.mastery}
              onChange={(event) =>
                onUpdate(node.id, {
                  mastery: event.target.value as GraphNode["mastery"],
                })
              }
              aria-label={locale === "zh" ? "掌握程度" : "Mastery"}
              className="h-9 rounded-xl border border-[var(--border)] bg-white/70 px-2 text-[10px]"
            >
              <option value="new">{locale === "zh" ? "未学习" : "New"}</option>
              <option value="learning">{locale === "zh" ? "学习中" : "Learning"}</option>
              <option value="mastered">{locale === "zh" ? "已掌握" : "Mastered"}</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="mr-auto text-[10px] text-[var(--muted-light)]">
              {locale === "zh" ? "回答质量" : "Answer quality"}
            </span>
            <Button
              size="icon"
              variant={node.rating === 1 ? "soft" : "ghost"}
              className="size-8"
              aria-label={locale === "zh" ? "有帮助" : "Helpful"}
              onClick={() => onUpdate(node.id, { rating: node.rating === 1 ? 0 : 1 })}
            >
              <ThumbsUp className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant={node.rating === -1 ? "soft" : "ghost"}
              className="size-8"
              aria-label={locale === "zh" ? "无帮助" : "Not helpful"}
              onClick={() => onUpdate(node.id, { rating: node.rating === -1 ? 0 : -1 })}
            >
              <ThumbsDown className="size-3.5" />
            </Button>
          </div>
        </section>

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
          </>
        )}
        </div>
      </div>

      <footer
        className={cn(
          "shrink-0 border-t border-[var(--border)] bg-white/55 p-4",
          embedded && "pb-24",
        )}
      >
        <div className={cn(embedded && "mx-auto w-full max-w-[820px]")}>
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
        </div>
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
