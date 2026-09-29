import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  FolderOpen,
  LoaderCircle,
  Maximize2,
  Moon,
  PanelLeftOpen,
  RadioTower,
  Sun,
  TerminalSquare,
} from "lucide-react";
import { api } from "@/lib/api";
import { buildOpenInTerminalCommand } from "@/lib/pi-terminal";
import { toggleTheme, useTheme } from "@/lib/theme";
import { useWorkspace } from "@/store/workspace";
import { useI18n } from "@/i18n";
import { Button } from "./ui/button";
import { Tooltip } from "./ui/tooltip";
import { PiSessionCanvas, type PiFlowInstance } from "./pi-session-canvas";
import { PiSessionInspector } from "./pi-session-inspector";

export const PI_SESSION_REFRESH_MS = 4_000;

export function PiSessionView({
  sessionId,
  onBack,
  onToast,
}: {
  sessionId: string;
  onBack: () => void;
  onToast: (message: string) => void;
}) {
  const { locale, t } = useI18n();
  const theme = useTheme();
  const { sidebarOpen, setSidebarOpen } = useWorkspace();
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null);
  const flowRef = useRef<PiFlowInstance | null>(null);
  const query = useQuery({
    queryKey: ["pi-session", sessionId],
    queryFn: () => api.piSession(sessionId),
    refetchInterval: PI_SESSION_REFRESH_MS,
  });
  const tree = query.data;

  // Default to the session's current position the first time a session loads.
  useEffect(() => {
    setSelectedTurnId(null);
  }, [sessionId]);
  useEffect(() => {
    if (!tree || selectedTurnId) return;
    if (tree.leafTurnId) setSelectedTurnId(tree.leafTurnId);
  }, [selectedTurnId, tree]);

  const selectedTurn =
    tree?.turns.find((turn) => turn.id === selectedTurnId) ?? null;
  const command = tree
    ? buildOpenInTerminalCommand(tree.session.cwd, tree.session.path)
    : "";

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(command);
      onToast(t("pi.copied"));
    } catch {
      onToast(`${t("pi.copyFailed")}: ${command}`);
    }
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col" data-testid="pi-session-view">
      <header className="topbar-shell z-10 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)]/85 px-4 backdrop-blur-xl sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
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
          <Tooltip content={t("pi.backToGraph")}>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={onBack}
              aria-label={t("pi.backToGraph")}
            >
              <ArrowLeft className="size-4" />
            </Button>
          </Tooltip>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-display text-[15px] font-semibold text-[var(--ink)] sm:text-[16px]">
                {tree?.session.name || tree?.session.firstPrompt || t("pi.untitled")}
              </h1>
              <span className="hidden items-center gap-1 rounded-md bg-[var(--accent-soft)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--accent-fg)] sm:flex">
                <RadioTower className="size-2.5" /> {t("pi.live")}
              </span>
            </div>
            <p className="mt-0.5 hidden items-center gap-1 truncate text-[10px] text-[var(--muted-light)] sm:flex">
              <FolderOpen className="size-3 shrink-0" />
              <span className="truncate font-mono">{tree?.session.cwd ?? ""}</span>
              {tree && (
                <span className="shrink-0">
                  {" · "}
                  {t("pi.turns", { count: tree.session.turnCount })}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => void copyCommand()}
            disabled={!tree}
            data-testid="pi-open-terminal"
          >
            <TerminalSquare className="size-3.5" />
            <span className="hidden sm:inline">{t("pi.openInTerminal")}</span>
          </Button>
          <Tooltip content={t("topbar.fit")}>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() =>
                void flowRef.current?.fitView({ padding: 0.22, duration: 400, maxZoom: 1 })
              }
              aria-label={t("topbar.fit")}
            >
              <Maximize2 className="size-3.5" />
            </Button>
          </Tooltip>
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
            >
              {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
            </Button>
          </Tooltip>
        </div>
      </header>

      {query.isLoading ? (
        <div className="grid flex-1 place-items-center">
          <LoaderCircle className="size-5 animate-spin text-[var(--accent)]" />
        </div>
      ) : !tree ? (
        <div className="grid flex-1 place-items-center p-6">
          <div className="max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-[var(--shadow-md)]">
            <AlertCircle className="mx-auto mb-4 size-8 text-[var(--danger)]" />
            <p className="text-sm leading-6 text-[var(--muted)]">
              {query.error instanceof Error ? query.error.message : t("pi.loadFailed")}
            </p>
            <Button className="mt-5" variant="outline" onClick={onBack}>
              <ArrowLeft className="size-4" /> {t("pi.backToGraph")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
          <section className="relative min-h-[40%] min-w-0 flex-1">
            <PiSessionCanvas
              tree={tree}
              selectedTurnId={selectedTurnId}
              onSelectTurn={setSelectedTurnId}
              onFlowReady={(instance) => {
                flowRef.current = instance;
              }}
            />
            <p className="pointer-events-none absolute left-4 top-4 z-10 rounded-lg border border-[var(--border)] bg-[var(--surface)]/90 px-2.5 py-1.5 text-[10px] text-[var(--muted)] shadow-[var(--shadow-xs)] backdrop-blur">
              {t("pi.readOnly")}
            </p>
          </section>
          <div className="min-h-0 w-full shrink-0 md:w-[44%] md:min-w-[340px] md:max-w-[560px]">
            <PiSessionInspector tree={tree} turn={selectedTurn} />
          </div>
        </div>
      )}
    </div>
  );
}
