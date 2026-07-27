import { useEffect, useState } from "react";
import { BarChart3, BookOpenCheck, FileInput, GitCompareArrows, Merge, RefreshCw, RotateCcw } from "lucide-react";
import type { GraphDocument, GraphMetrics, StudyCard } from "@shared/types";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n";
import { useWorkspace } from "@/store/workspace";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input, Label, Textarea } from "./ui/field";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

export function WorkspaceTools({
  document,
  open,
  onOpenChange,
  onImported,
}: {
  document: GraphDocument;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => Promise<void>;
}) {
  const { locale } = useI18n();
  const [metrics, setMetrics] = useState<GraphMetrics | null>(null);
  const [cards, setCards] = useState<StudyCard[]>([]);
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const referenceNodeIds = useWorkspace((state) => state.referenceNodeIds);
  const setMode = useWorkspace((state) => state.setMode);
  const openComposer = useWorkspace((state) => state.openComposer);
  const comparisonNodes = document.nodes.filter((node) =>
    referenceNodeIds.includes(node.id),
  );

  const load = async () => {
    const [nextMetrics, nextCards] = await Promise.all([
      api.metrics(document.graph.id),
      api.studyCards(document.graph.id),
    ]);
    setMetrics(nextMetrics);
    setCards(nextCards);
  };

  useEffect(() => {
    if (!open) return;
    setError("");
    void load();
  }, [document.graph.id, open]);

  const importContent = async () => {
    if (!title.trim() || !content.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.importText({
        graphId: document.graph.id,
        title: title.trim(),
        content,
        sourceUrl: sourceUrl.trim(),
        format: "markdown",
      });
      setTitle("");
      setSourceUrl("");
      setContent("");
      await onImported();
      await load();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const loadSourceFile = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    if (!/\.(md|markdown|txt|pdf)$/i.test(file.name)) {
      setError(locale === "zh" ? "目前文件导入支持 .md、.txt 和 .pdf。" : "File import supports .md, .txt, and .pdf.");
      return;
    }
    setTitle(file.name.replace(/\.(md|markdown|txt|pdf)$/i, ""));
    if (/\.pdf$/i.test(file.name)) {
      if (file.size > 25 * 1024 * 1024) {
        setError(locale === "zh" ? "PDF 不能超过 25 MB。" : "PDF files must be 25 MB or smaller.");
        return;
      }
      setBusy(true);
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        const pdf = await pdfjs.getDocument({
          data: new Uint8Array(await file.arrayBuffer()),
        }).promise;
        const pages: string[] = [];
        for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 200); pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const text = await page.getTextContent();
          pages.push(
            text.items
              .map((item) => ("str" in item ? item.str : ""))
              .join(" ")
              .replace(/\s+/g, " ")
              .trim(),
          );
        }
        const extracted = pages
          .map((page, index) => ({ page, pageNumber: index + 1 }))
          .filter(({ page }) => Boolean(page));
        if (extracted.length === 0) {
          setError(
            locale === "zh"
              ? "该 PDF 没有可提取文本；扫描件请先进行 OCR。"
              : "This PDF has no extractable text. Run OCR on scanned documents first.",
          );
          return;
        }
        setContent(
          extracted
            .map(({ page, pageNumber }) => `# Page ${pageNumber}\n\n${page}`)
            .join("\n\n"),
        );
      } catch (pdfError) {
        setError(pdfError instanceof Error ? pdfError.message : "Unable to read PDF.");
      } finally {
        setBusy(false);
      }
      return;
    }
    setContent(await file.text());
  };

  const restoreBackup = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.restoreBackup(JSON.parse(await file.text()));
      window.location.reload();
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Restore failed.");
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] w-[min(94vw,760px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{locale === "zh" ? "学习工作台" : "Learning workspace"}</DialogTitle>
          <DialogDescription>
            {locale === "zh"
              ? "导入资料、检查学习闭环，并从低掌握节点开始复习。"
              : "Import sources, inspect the learning loop, and review low-mastery nodes."}
          </DialogDescription>
        </DialogHeader>

        {metrics && (
          <section>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold">
              <BarChart3 className="size-4" />
              {locale === "zh" ? "本地图指标" : "Local graph metrics"}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                [locale === "zh" ? "节点" : "Nodes", metrics.nodes],
                [locale === "zh" ? "跨分支引用" : "References", metrics.references],
                [locale === "zh" ? "结论" : "Conclusions", metrics.conclusions],
                [locale === "zh" ? "可复用结论" : "Reusable", metrics.reusableConclusions],
                [locale === "zh" ? "近 7 日活动" : "7-day activity", metrics.activityLast7Days],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border border-[var(--border)] bg-white/60 p-3">
                  <div className="font-display text-xl font-semibold">{value}</div>
                  <div className="text-[10px] text-[var(--muted-light)]">{label}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-6 border-t border-[var(--border)] pt-5">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold">
            <GitCompareArrows className="size-4" />
            {locale === "zh" ? "分支比较" : "Branch comparison"}
          </div>
          {comparisonNodes.length < 2 ? (
            <p className="rounded-xl bg-black/[0.035] px-4 py-3 text-xs leading-5 text-[var(--muted)]">
              {locale === "zh"
                ? "在画布中打开节点详情，点击“加入汇聚”，至少选择两个节点后即可并排比较。"
                : "Open node details and choose “Add to synthesis” on at least two nodes to compare them here."}
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {comparisonNodes.map((node) => (
                  <article key={node.id} className="rounded-xl border border-[var(--border)] bg-white/60 p-4">
                    <h3 className="text-xs font-semibold">{node.title}</h3>
                    <p className="mt-2 line-clamp-6 text-[11px] leading-5 text-[var(--muted)]">
                      {node.summary || node.content}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {node.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-black/[0.045] px-2 py-0.5 text-[9px]">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  onClick={() => {
                    setMode("synthesize");
                    openComposer();
                    onOpenChange(false);
                  }}
                >
                  <Merge className="size-3.5" />
                  {locale === "zh" ? "汇聚所选分支" : "Synthesize selected branches"}
                </Button>
              </div>
            </>
          )}
        </section>

        <section className="mt-6 border-t border-[var(--border)] pt-5">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold">
            <FileInput className="size-4" />
            {locale === "zh" ? "导入 Markdown / 文本" : "Import Markdown / text"}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="import-title">{locale === "zh" ? "资料标题" : "Source title"}</Label>
              <Input id="import-title" value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="import-source">{locale === "zh" ? "来源链接（可选）" : "Source URL (optional)"}</Label>
              <Input id="import-source" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} />
            </div>
          </div>
          <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-black/[0.02] px-3 py-3 text-[10px] font-medium text-[var(--muted)] hover:bg-black/[0.035]">
            <FileInput className="size-3.5" />
            {locale === "zh" ? "选择 .md / .txt / .pdf 文件" : "Choose a .md / .txt / .pdf file"}
            <input
              type="file"
              accept=".md,.markdown,.txt,.pdf,text/plain,text/markdown,application/pdf"
              className="sr-only"
              aria-label={locale === "zh" ? "选择资料文件" : "Choose source file"}
              onChange={(event) => void loadSourceFile(event.target.files?.[0])}
            />
          </label>
          <Label htmlFor="import-content" className="mt-3">
            {locale === "zh" ? "内容" : "Content"}
          </Label>
          <Textarea
            id="import-content"
            rows={7}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="# Heading\n\nPaste notes or source excerpts…"
          />
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <div className="mt-3 flex justify-end">
            <Button disabled={!title.trim() || !content.trim() || busy} onClick={() => void importContent()}>
              <FileInput className="size-3.5" />
              {locale === "zh" ? "导入到当前图" : "Import into graph"}
            </Button>
          </div>
        </section>

        <section className="mt-6 border-t border-[var(--border)] pt-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <BookOpenCheck className="size-4" />
              {locale === "zh" ? "复习队列" : "Study queue"}
            </div>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => void load()}>
              <RefreshCw className="size-3.5" />
            </Button>
          </div>
          <div className="space-y-2">
            {cards.slice(0, 8).map((card) => (
              <details key={`${card.nodeId}-${card.kind}`} className="rounded-xl border border-[var(--border)] bg-white/60 px-4 py-3">
                <summary className="cursor-pointer text-xs font-medium">
                  <span className="mr-2 rounded-full bg-black/[0.045] px-2 py-0.5 text-[8px] uppercase text-[var(--muted-light)]">
                    {card.kind}
                  </span>
                  {card.question}
                </summary>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{card.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <div className="mt-6 flex justify-between gap-4 border-t border-[var(--border)] pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={`/api/graphs/${document.graph.id}/export.md`}
              download
              className="text-xs font-medium text-[#4d775b] hover:underline"
            >
              {locale === "zh" ? "导出当前图为 Markdown" : "Export graph as Markdown"}
            </a>
            <a href="/api/export" download className="text-xs font-medium text-[#4d775b] hover:underline">
              {locale === "zh" ? "下载完整备份" : "Download full backup"}
            </a>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-[#6d6282] hover:underline">
              <RotateCcw className="size-3.5" />
              {locale === "zh" ? "恢复备份" : "Restore backup"}
              <input
                type="file"
                accept=".json,application/json"
                className="sr-only"
                aria-label={locale === "zh" ? "选择备份文件" : "Choose backup file"}
                onChange={(event) => void restoreBackup(event.target.files?.[0])}
              />
            </label>
          </div>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {locale === "zh" ? "关闭" : "Close"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
