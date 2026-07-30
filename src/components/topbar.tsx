import {
  Check,
  FileText,
  Globe2,
  Maximize2,
  Moon,
  Network,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  Sun,
  TreePine,
  Undo2,
  Wrench,
} from "lucide-react";
import type { GraphDocument, ProviderSettings } from "@shared/types";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Tooltip } from "./ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useWorkspace } from "@/store/workspace";
import { toggleTheme, useTheme } from "@/lib/theme";
import { localeMeta, locales, useI18n } from "@/i18n";

export function Topbar({
  document,
  settings,
  onFitView,
  onOpenTools,
  onUndo,
  viewMode,
  onViewModeChange,
}: {
  document: GraphDocument;
  settings: ProviderSettings;
  onFitView: () => void;
  onOpenTools: () => void;
  onUndo: () => void;
  viewMode: "content" | "tree" | "graph";
  onViewModeChange: (mode: "content" | "tree" | "graph") => void;
}) {
  const { sidebarOpen, setSidebarOpen, inspectorOpen, setInspectorOpen } = useWorkspace();
  const setSettingsOpen = useWorkspace((state) => state.setSettingsOpen);
  const theme = useTheme();
  const { locale, setLocale, t } = useI18n();

  return (
    <header className="topbar-shell z-10 flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]/85 px-4 backdrop-blur-xl sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        {!sidebarOpen && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => setSidebarOpen(true)}
            aria-label={t("sidebar.open")}
          >
            <PanelLeftOpen className="size-4" />
          </Button>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-display text-[15px] font-semibold text-[var(--ink)] sm:text-[16px]">
              {document.graph.title}
            </h1>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="group hidden rounded-full sm:block"
              aria-label={`${t("settings.chooseModel")}: ${settings.model}`}
              title={t("settings.chooseModel")}
            >
              <Badge className="border-[var(--accent)]/20 bg-[var(--accent-soft)] text-[var(--accent-fg)] transition group-hover:border-[var(--accent)]/35 group-hover:bg-[var(--hover-strong)]">
                <span className="mr-1 size-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_0_3px_var(--accent-ring)]" />
                {settings.provider === "openai-codex"
                  ? `ChatGPT · ${settings.model}`
                  : settings.model}
              </Badge>
            </button>
          </div>
          <p className="mt-0.5 hidden truncate text-[10px] text-[var(--muted-light)] sm:block">
            {document.graph.description}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <div className="mr-2 hidden items-center gap-1.5 text-[10px] text-[var(--muted-light)] xl:flex">
          <Sparkles className="size-3 text-[var(--accent)]" />
          {t("topbar.stats", {
            nodes: document.nodes.length,
            edges: document.edges.length,
          })}
        </div>
        <div className="flex rounded-lg border border-[var(--border)] bg-[var(--paper-deep)] p-0.5">
          <Button
            variant={viewMode === "content" ? "soft" : "ghost"}
            size="sm"
            className="h-7 px-1.5 text-[10px] sm:px-2"
            onClick={() => onViewModeChange("content")}
            aria-label={locale.startsWith("zh") ? "内容视图" : "Content view"}
            aria-pressed={viewMode === "content"}
          >
            <FileText className="size-3" />
            <span className="hidden 2xl:inline">{locale.startsWith("zh") ? "聊天" : "Chat"}</span>
          </Button>
          <Button
            variant={viewMode === "tree" ? "soft" : "ghost"}
            size="sm"
            className="h-7 px-1.5 text-[10px] sm:px-2"
            onClick={() => onViewModeChange("tree")}
            aria-label={locale.startsWith("zh") ? "知识树视图" : "Tree view"}
            aria-pressed={viewMode === "tree"}
          >
            <TreePine className="size-3" />
            <span className="hidden 2xl:inline">{locale.startsWith("zh") ? "树" : "Tree"}</span>
          </Button>
          <Button
            variant={viewMode === "graph" ? "soft" : "ghost"}
            size="sm"
            className="h-7 px-1.5 text-[10px] sm:px-2"
            onClick={() => onViewModeChange("graph")}
            aria-label={locale.startsWith("zh") ? "图谱视图" : "Graph view"}
            aria-pressed={viewMode === "graph"}
          >
            <Network className="size-3" />
            <span className="hidden 2xl:inline">{locale.startsWith("zh") ? "图谱" : "Graph"}</span>
          </Button>
        </div>
        <div className="size-8 shrink-0">
          {viewMode === "graph" && (
            <Tooltip content={t("topbar.fit")}>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={onFitView}
              >
                <Maximize2 className="size-3.5" />
              </Button>
            </Tooltip>
          )}
        </div>
        <Tooltip content={locale.startsWith("zh") ? "撤销上一步图谱修改" : "Undo last graph change"}>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onUndo}
            aria-label={locale.startsWith("zh") ? "撤销" : "Undo"}
          >
            <Undo2 className="size-3.5" />
          </Button>
        </Tooltip>
        <Tooltip content={locale.startsWith("zh") ? "工具" : "Tools"}>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onOpenTools}
            aria-label={locale.startsWith("zh") ? "工具" : "Tools"}
          >
            <Wrench className="size-3.5" />
          </Button>
        </Tooltip>
        <div className="size-8 shrink-0">
        {viewMode === "content" && <Tooltip
          content={
            inspectorOpen
              ? locale.startsWith("zh") ? "隐藏知识树" : "Hide knowledge tree"
              : locale.startsWith("zh") ? "显示知识树" : "Show knowledge tree"
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
        </Tooltip>}
        </div>
        <DropdownMenu>
          <Tooltip content={t("language.label")}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={t("language.label")}
                data-testid="language-menu"
              >
                <Globe2 className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
          </Tooltip>
          <DropdownMenuContent align="end">
            {locales.map((language) => (
              <DropdownMenuItem
                key={language}
                onSelect={() => setLocale(language)}
                aria-current={language === locale}
              >
                <span className="flex-1">{localeMeta[language].label}</span>
                {language === locale && <Check className="size-3.5 text-[var(--muted)]" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip
          content={
            theme === "dark"
              ? locale.startsWith("zh") ? "切换到浅色模式" : "Switch to light mode"
              : locale.startsWith("zh") ? "切换到深色模式" : "Switch to dark mode"
          }
        >
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={toggleTheme}
            aria-label={
              theme === "dark"
                ? locale.startsWith("zh") ? "切换到浅色模式" : "Switch to light mode"
                : locale.startsWith("zh") ? "切换到深色模式" : "Switch to dark mode"
            }
            data-testid="theme-toggle"
          >
            {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
          </Button>
        </Tooltip>
      </div>
    </header>
  );
}
