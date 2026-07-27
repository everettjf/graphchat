import {
  Menu,
  Maximize2,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  Undo2,
  Wrench,
} from "lucide-react";
import type { GraphDocument, ProviderSettings } from "@shared/types";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Tooltip } from "./ui/tooltip";
import { useWorkspace } from "@/store/workspace";
import { useI18n } from "@/i18n";

export function Topbar({
  document,
  settings,
  onFitView,
  onOpenTools,
  onUndo,
}: {
  document: GraphDocument;
  settings: ProviderSettings;
  onFitView: () => void;
  onOpenTools: () => void;
  onUndo: () => void;
}) {
  const { setSidebarOpen, inspectorOpen, setInspectorOpen } = useWorkspace();
  const { locale, setLocale, t } = useI18n();

  return (
    <header className="topbar-shell z-10 flex h-16 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[#f8f6f0]/86 px-4 backdrop-blur-xl sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setSidebarOpen(true)}
          aria-label={t("topbar.openNav")}
        >
          <Menu className="size-4" />
        </Button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-display text-[15px] font-semibold text-[var(--ink)] sm:text-[16px]">
              {document.graph.title}
            </h1>
            <Badge className="hidden border-[#d5e3d8] bg-[#edf4ee] text-[#4c7358] sm:inline-flex">
              {settings.provider === "demo"
                ? t("topbar.localDemo")
                : settings.provider === "openai-codex"
                  ? `ChatGPT · ${settings.model}`
                  : settings.model}
            </Badge>
          </div>
          <p className="mt-0.5 hidden truncate text-[10px] text-[var(--muted-light)] sm:block">
            {document.graph.description}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <div className="mr-2 hidden items-center gap-1.5 text-[10px] text-[var(--muted-light)] xl:flex">
          <Sparkles className="size-3 text-[#78ad8b]" />
          {t("topbar.stats", {
            nodes: document.nodes.length,
            edges: document.edges.length,
          })}
        </div>
        <div
          className="app-language-switch"
          role="group"
          aria-label="Language"
        >
          <button
            type="button"
            className={locale === "en" ? "is-active" : ""}
            aria-pressed={locale === "en"}
            onClick={() => setLocale("en")}
          >
            EN
          </button>
          <button
            type="button"
            className={locale === "zh" ? "is-active" : ""}
            aria-pressed={locale === "zh"}
            onClick={() => setLocale("zh")}
          >
            中文
          </button>
        </div>
        <Tooltip content={t("topbar.fit")}>
          <Button variant="ghost" size="icon" className="size-8" onClick={onFitView}>
            <Maximize2 className="size-3.5" />
          </Button>
        </Tooltip>
        <Tooltip content={locale === "zh" ? "撤销上一步图谱修改" : "Undo last graph change"}>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onUndo}
            aria-label={locale === "zh" ? "撤销" : "Undo"}
          >
            <Undo2 className="size-3.5" />
          </Button>
        </Tooltip>
        <Tooltip content={locale === "zh" ? "学习工作台" : "Learning workspace"}>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onOpenTools}
            aria-label={locale === "zh" ? "学习工作台" : "Learning workspace"}
          >
            <Wrench className="size-3.5" />
          </Button>
        </Tooltip>
        <Tooltip
          content={
            inspectorOpen ? t("topbar.hideDetails") : t("topbar.showDetails")
          }
        >
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setInspectorOpen(!inspectorOpen)}
          >
            {inspectorOpen ? <PanelRightClose className="size-3.5" /> : <PanelRightOpen className="size-3.5" />}
          </Button>
        </Tooltip>
      </div>
    </header>
  );
}
