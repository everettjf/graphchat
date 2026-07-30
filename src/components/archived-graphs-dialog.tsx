import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Archive, RotateCcw, Search, Trash2, X } from "lucide-react";
import type { GraphMeta } from "@shared/types";
import { useI18n } from "@/i18n";
import { formatRelativeTime } from "@/lib/utils";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/field";

type ArchivedGraphsDialogProps = {
  open: boolean;
  graphs: GraphMeta[];
  onOpenChange: (open: boolean) => void;
  onRestore: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onDeleteAll: () => Promise<void>;
};

export function ArchivedGraphsDialog({
  open,
  graphs,
  onOpenChange,
  onRestore,
  onDelete,
  onDeleteAll,
}: ArchivedGraphsDialogProps) {
  const { locale, t } = useI18n();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(50);
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const filteredGraphs = useMemo(() => {
    if (!deferredQuery) return graphs;
    return graphs.filter((graph) =>
      `${graph.title} ${graph.description}`
        .toLocaleLowerCase()
        .includes(deferredQuery),
    );
  }, [deferredQuery, graphs]);
  const visibleGraphs = filteredGraphs.slice(0, visibleCount);

  useEffect(() => {
    if (open) {
      setQuery("");
      setVisibleCount(50);
      setError("");
    }
  }, [open]);

  useEffect(() => setVisibleCount(50), [deferredQuery]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(92vw,520px)] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t("sidebar.archivedThreads")}
            <span className="rounded-md bg-[var(--hover)] px-1.5 py-0.5 font-sans text-[10px] font-medium text-[var(--muted)]">
              {graphs.length}
            </span>
          </DialogTitle>
          <DialogDescription>{t("archive.description")}</DialogDescription>
        </DialogHeader>
        <div className="-mt-2 mb-3 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2.5 text-[10px] text-[var(--danger)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
            disabled={deletingAll || graphs.length === 0}
            onClick={async () => {
              if (
                !window.confirm(
                  t("archive.deleteAllConfirm", { count: graphs.length }),
                )
              ) {
                return;
              }
              setDeletingAll(true);
              setError("");
              try {
                await onDeleteAll();
              } catch (actionError) {
                setError(
                  actionError instanceof Error
                    ? actionError.message
                    : t("archive.deleteAllFailed"),
                );
              } finally {
                setDeletingAll(false);
              }
            }}
          >
            <Trash2 className="size-3.5" />
            {deletingAll ? t("archive.deleting") : t("archive.deleteAll")}
          </Button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--muted-light)]" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t("archive.searchLabel")}
            placeholder={t("archive.searchPlaceholder")}
            className="h-9 rounded-lg pl-9 pr-9 text-[11px]"
          />
          {query && (
            <button
              type="button"
              className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-[var(--muted-light)] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
              onClick={() => setQuery("")}
              aria-label={t("archive.clearSearch")}
            >
              <X className="size-3" />
            </button>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between px-1 text-[9px] text-[var(--muted-light)]">
          <span>
            {t("archive.showing", {
              visible: visibleGraphs.length,
              filtered: filteredGraphs.length,
            })}
          </span>
          {deferredQuery && filteredGraphs.length !== graphs.length && (
            <span>{t("archive.total", { count: graphs.length })}</span>
          )}
        </div>
        {error && (
          <p className="mt-2 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-[10px] text-[var(--danger)]">
            {error}
          </p>
        )}
        <div className="mt-1 max-h-[min(55vh,460px)] min-h-16 space-y-1 overflow-y-auto overscroll-contain pr-1">
          {visibleGraphs.length > 0 ? (
            visibleGraphs.map((graph) => (
              <div
                key={graph.id}
                className="flex min-h-11 items-center gap-3 rounded-xl border border-transparent px-3 py-1.5 hover:border-[var(--border)] hover:bg-[var(--hover)]"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--hover)] text-[var(--muted-light)]">
                  <Archive className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-semibold text-[var(--ink)]">
                    {graph.title}
                  </span>
                  <span className="block text-[9px] text-[var(--muted-light)]">
                    {t("archive.archivedAt", {
                      time: formatRelativeTime(
                        graph.archivedAt || graph.updatedAt,
                        locale,
                      ),
                    })}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-[10px]"
                  disabled={
                    restoringId === graph.id ||
                    deletingId === graph.id ||
                    deletingAll
                  }
                  onClick={async () => {
                    setRestoringId(graph.id);
                    setError("");
                    try {
                      await onRestore(graph.id);
                    } catch (actionError) {
                      setError(
                        actionError instanceof Error
                          ? actionError.message
                          : t("archive.restoreFailed"),
                      );
                    } finally {
                      setRestoringId(null);
                    }
                  }}
                  aria-label={t("graph.restore", { title: graph.title })}
                >
                  <RotateCcw className="size-3" /> {t("archive.restore")}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 text-[var(--muted-light)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                  disabled={
                    deletingId === graph.id ||
                    restoringId === graph.id ||
                    deletingAll
                  }
                  aria-label={t("archive.deleteOneLabel", {
                    title: graph.title,
                  })}
                  onClick={async () => {
                    if (
                      !window.confirm(
                        t("archive.deleteOneConfirm", { title: graph.title }),
                      )
                    ) {
                      return;
                    }
                    setDeletingId(graph.id);
                    setError("");
                    try {
                      await onDelete(graph.id);
                    } catch (actionError) {
                      setError(
                        actionError instanceof Error
                          ? actionError.message
                          : t("archive.deleteOneFailed"),
                      );
                    } finally {
                      setDeletingId(null);
                    }
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))
          ) : (
            <div className="grid min-h-24 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 text-center text-[10px] text-[var(--muted)]">
              {t("archive.noMatches", { query: query.trim() })}
            </div>
          )}
        </div>
        {visibleGraphs.length < filteredGraphs.length && (
          <div className="mt-2 border-t border-[var(--border)] pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-full text-[10px]"
              onClick={() => setVisibleCount((count) => count + 50)}
            >
              {t("archive.loadMore")}
              <span className="text-[var(--muted-light)]">
                {t("archive.remaining", {
                  count: filteredGraphs.length - visibleGraphs.length,
                })}
              </span>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
