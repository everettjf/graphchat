import { GitBranch, Link2, Network, X } from "lucide-react";
import type { GraphDocument, GraphNode } from "@shared/types";
import { useWorkspace } from "@/store/workspace";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

type TreeEntry = {
  node: GraphNode;
  depth: number;
  referenceCount: number;
};

function buildTree(document: GraphDocument): TreeEntry[] {
  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));
  const children = new Map<string, string[]>();
  const childIds = new Set<string>();
  for (const edge of document.edges.filter((edge) => edge.kind === "branch")) {
    const current = children.get(edge.source) || [];
    current.push(edge.target);
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
  const visit = (node: GraphNode, depth: number) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    entries.push({
      node,
      depth,
      referenceCount: references.get(node.id) || 0,
    });
    for (const childId of children.get(node.id) || []) {
      const child = nodeById.get(childId);
      if (child) visit(child, depth + 1);
    }
  };
  for (const root of roots) visit(root, 0);
  for (const node of document.nodes) visit(node, 0);
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
  const { locale } = useI18n();
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
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Network className="size-4 text-[#5d8068]" />
            {locale === "zh" ? "知识树" : "Knowledge tree"}
          </div>
          <p className="mt-0.5 text-[9px] text-[var(--muted-light)]">
            {document.nodes.length} {locale === "zh" ? "个内容节点" : "content nodes"}
          </p>
        </div>
        {mode === "split" && <Button
          variant="ghost"
          size="icon"
          className="size-8 xl:hidden"
          onClick={() => setInspectorOpen(false)}
          aria-label={locale === "zh" ? "关闭知识树" : "Close knowledge tree"}
        >
          <X className="size-4" />
        </Button>}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
        {entries.length === 0 ? (
          <div className="m-2 rounded-2xl border border-dashed border-[var(--border)] p-5 text-center text-xs leading-5 text-[var(--muted)]">
            {locale === "zh"
              ? "提出第一个问题后，这里会形成内容树。"
              : "Ask the first question to grow a content tree here."}
          </div>
        ) : (
          <div className="space-y-0.5">
            {entries.map(({ node, depth, referenceCount }) => (
              <button
                key={node.id}
                type="button"
                onClick={() => {
                  selectNode(node.id);
                  onNodeOpen?.(node.id);
                }}
                className={cn(
                  "group flex w-full items-start gap-2 rounded-xl py-2 pr-2 text-left transition hover:bg-black/[0.035]",
                  selectedNodeId === node.id && "bg-white shadow-sm ring-1 ring-black/[0.05]",
                )}
                style={{ paddingLeft: `${10 + Math.min(depth, 7) * 16}px` }}
                data-testid={`tree-node-${node.id}`}
              >
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-[#e5eee7] text-[#50715a]">
                  <GitBranch className="size-3" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block text-[11px] font-medium leading-4 text-[var(--ink)]">
                    {node.title}
                  </span>
                  <span className="mt-1 flex items-center gap-1.5 text-[8px] uppercase text-[var(--muted-light)]">
                    {node.kind}
                    {referenceCount > 0 && (
                      <span className="inline-flex items-center gap-0.5">
                        <Link2 className="size-2.5" /> {referenceCount}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
