import { ArrowDown, GitBranch, Link2, Network, X } from "lucide-react";
import type { GraphDocument, GraphEdge, GraphNode } from "@shared/types";
import { useWorkspace } from "@/store/workspace";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

type TreeEntry = {
  node: GraphNode;
  depth: number;
  referenceCount: number;
  relationship: GraphEdge["kind"] | "root";
};

function buildTree(document: GraphDocument): TreeEntry[] {
  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));
  const children = new Map<string, Array<{ id: string; kind: GraphEdge["kind"] }>>();
  const childIds = new Set<string>();
  for (const edge of document.edges.filter(
    (edge) => edge.kind === "branch" || edge.kind === "continuation",
  )) {
    const current = children.get(edge.source) || [];
    current.push({ id: edge.target, kind: edge.kind });
    children.set(edge.source, current);
    childIds.add(edge.target);
  }
  const references = new Map<string, number>();
  for (const edge of document.edges.filter((edge) => edge.kind !== "branch")) {
    references.set(edge.target, (references.get(edge.target) || 0) + 1);
  }
  const roots = document.nodes
    .filter((node) => !childIds.has(node.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const entries: TreeEntry[] = [];
  const visited = new Set<string>();
  const visit = (
    node: GraphNode,
    depth: number,
    relationship: GraphEdge["kind"] | "root",
  ) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    entries.push({
      node,
      depth,
      referenceCount: references.get(node.id) || 0,
      relationship,
    });
    for (const childEntry of children.get(node.id) || []) {
      const child = nodeById.get(childEntry.id);
      if (child) {
        visit(
          child,
          depth + (childEntry.kind === "branch" ? 1 : 0),
          childEntry.kind,
        );
      }
    }
  };
  for (const root of roots) visit(root, 0, "root");
  for (const node of document.nodes) visit(node, 0, "root");
  return entries;
}

export function KnowledgeTree({
  document,
  mode = "split",
  onNodeOpen,
}: {
  document: GraphDocument;
  mode?: "split" | "full";
  onNodeOpen?: (nodeId: string) => void;
}) {
  const { locale, t } = useI18n();
  const { selectedNodeId, selectNode, inspectorOpen, setInspectorOpen } =
    useWorkspace();
  const entries = buildTree(document);

  if (mode === "split" && !inspectorOpen) return null;

  return (
    <aside
      className={cn(
        "z-20 flex h-full min-w-0 flex-1 flex-col bg-[#f6f4ed]/96",
        mode === "split" && "hidden border-l border-[var(--border)] md:flex",
      )}
      data-testid="knowledge-tree"
    >
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Network className="size-4 text-[#5d8068]" />
            {locale.startsWith("zh") ? "知识树" : "Knowledge tree"}
          </div>
          <p className="mt-0.5 text-[9px] text-[var(--muted-light)]">
            {document.nodes.length} {locale.startsWith("zh") ? "个内容节点" : "content nodes"}
          </p>
        </div>
        {mode === "split" && <Button
          variant="ghost"
          size="icon"
          className="size-8 xl:hidden"
          onClick={() => setInspectorOpen(false)}
          aria-label={locale.startsWith("zh") ? "关闭知识树" : "Close knowledge tree"}
        >
          <X className="size-4" />
        </Button>}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
        {entries.length === 0 ? (
          <div className="m-2 rounded-2xl border border-dashed border-[var(--border)] p-5 text-center text-xs leading-5 text-[var(--muted)]">
            {locale.startsWith("zh")
              ? "提出第一个问题后，这里会形成内容树。"
              : "Ask the first question to grow a content tree here."}
          </div>
        ) : (
          <div className="space-y-0.5">
            {entries.map(({ node, depth, referenceCount, relationship }) => (
              <button
                key={node.id}
                type="button"
                onClick={() => {
                  selectNode(node.id);
                  onNodeOpen?.(node.id);
                }}
                className={cn(
                  "group flex h-7 w-full items-center gap-1.5 rounded-md py-0.5 pr-1.5 text-left transition hover:bg-black/[0.035]",
                  selectedNodeId === node.id && "bg-white shadow-sm ring-1 ring-black/[0.05]",
                )}
                style={{ paddingLeft: `${8 + Math.min(depth, 7) * 14}px` }}
                data-testid={`tree-node-${node.id}`}
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded bg-[#e5eee7] text-[#50715a]",
                    relationship === "branch" && "bg-[#eee9f6] text-[#76648d]",
                  )}
                  title={
                    relationship === "branch"
                      ? t("edge.branch")
                      : relationship === "continuation"
                        ? t("edge.continue")
                        : t("relation.threadStart")
                  }
                >
                  {relationship === "branch" ? (
                    <GitBranch className="size-2.5" />
                  ) : (
                    <ArrowDown className="size-2.5" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-[10px] font-medium leading-3.5 text-[var(--ink)]">
                    {node.title}
                </span>
                {relationship !== "root" && (
                  <span className="shrink-0 text-[7px] uppercase text-[var(--muted-light)]">
                    {relationship === "branch"
                      ? t("edge.branch")
                      : t("edge.continue")}
                  </span>
                )}
                {referenceCount > 0 && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 text-[7px] text-[var(--muted-light)]">
                    <Link2 className="size-2.5" /> {referenceCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
