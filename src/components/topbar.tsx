import {
  Menu,
  Maximize2,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
} from "lucide-react";
import type { GraphDocument, ProviderSettings } from "@shared/types";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Tooltip } from "./ui/tooltip";
import { useWorkspace } from "@/store/workspace";

export function Topbar({
  document,
  settings,
  onFitView,
}: {
  document: GraphDocument;
  settings: ProviderSettings;
  onFitView: () => void;
}) {
  const { setSidebarOpen, inspectorOpen, setInspectorOpen } = useWorkspace();

  return (
    <header className="topbar-shell z-10 flex h-16 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[#f8f6f0]/86 px-4 backdrop-blur-xl sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setSidebarOpen(true)}
          aria-label="打开导航"
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
                ? "本地演示"
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
          {document.nodes.length} 个节点 · {document.edges.length} 条关系
        </div>
        <Tooltip content="适应画布">
          <Button variant="ghost" size="icon" className="size-8" onClick={onFitView}>
            <Maximize2 className="size-3.5" />
          </Button>
        </Tooltip>
        <Tooltip content={inspectorOpen ? "收起详情" : "显示详情"}>
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
