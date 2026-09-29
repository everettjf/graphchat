import { useEffect, useMemo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { PiSessionTree } from "@shared/types";
import { PI_TURN_WIDTH, PiTurnCard, type PiTurnData } from "./pi-turn-card";
import { layoutTree } from "@/lib/graph-layout";
import { useTheme } from "@/lib/theme";
import { useWorkspace } from "@/store/workspace";

const nodeTypes = { piTurn: PiTurnCard };

// SVG attribute colors cannot resolve CSS var(); mirror the --edge-* tokens.
const EDGE_COLORS = {
  light: { active: "#454b52", abandoned: "#b6bcc4" },
  dark: { active: "#c9cdd3", abandoned: "#55565c" },
} as const;
const BACKGROUND_DOT_COLORS = { light: "#d4d8dd", dark: "#3a3a40" } as const;
const MINIMAP_COLORS = {
  light: { active: "#9aa1ab", abandoned: "#d4d8dd", mask: "rgba(238,240,242,.72)" },
  dark: { active: "#6e6e76", abandoned: "#3a3a40", mask: "rgba(36,36,39,.72)" },
} as const;

export type PiFlowInstance = ReactFlowInstance<Node<PiTurnData>, Edge>;

export function PiSessionCanvas({
  tree,
  selectedTurnId,
  onSelectTurn,
  onFlowReady,
}: {
  tree: PiSessionTree;
  selectedTurnId: string | null;
  onSelectTurn: (id: string | null) => void;
  onFlowReady?: (instance: PiFlowInstance) => void;
}) {
  const theme = useTheme();
  const search = useWorkspace((state) => state.search.trim().toLocaleLowerCase());
  const flowRef = useRef<PiFlowInstance | null>(null);
  const turnCount = tree.turns.length;

  const nodes = useMemo<Node<PiTurnData>[]>(() => {
    const positions = layoutTree({
      ids: tree.turns.map((turn) => turn.id),
      parentById: new Map(tree.turns.map((turn) => [turn.id, turn.parentId])),
      nodeWidth: PI_TURN_WIDTH,
      rowGap: 224,
    });
    return tree.turns.map((turn) => {
      const haystack = `${turn.title} ${turn.prompt} ${turn.response} ${turn.model ?? ""} ${turn.toolCalls
        .map((call) => call.name)
        .join(" ")}`.toLocaleLowerCase();
      return {
        id: turn.id,
        type: "piTurn",
        position: positions.get(turn.id) ?? { x: 0, y: 0 },
        selected: turn.id === selectedTurnId,
        draggable: false,
        data: { turn, dimmed: Boolean(search) && !haystack.includes(search) },
      };
    });
  }, [search, selectedTurnId, tree.turns]);

  const edges = useMemo<Edge[]>(
    () =>
      tree.turns
        .filter((turn) => turn.parentId)
        .map((turn) => ({
          id: `${turn.parentId}->${turn.id}`,
          source: turn.parentId!,
          target: turn.id,
          type: "smoothstep",
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 12,
            height: 12,
            color: turn.onActivePath ? EDGE_COLORS[theme].active : EDGE_COLORS[theme].abandoned,
          },
          style: {
            stroke: turn.onActivePath ? "var(--edge-branch)" : "var(--edge-continuation)",
            strokeWidth: turn.onActivePath ? 1.55 : 1.2,
            strokeDasharray: turn.onActivePath ? undefined : "6 5",
          },
        })),
    [theme, tree.turns],
  );

  // Keep new turns visible as a live session grows.
  useEffect(() => {
    const instance = flowRef.current;
    if (!instance) return;
    const frame = window.requestAnimationFrame(() =>
      void instance.fitView({ padding: 0.22, maxZoom: 1, duration: 300 }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [turnCount]);

  return (
    <div className="relative h-full w-full" data-testid="pi-session-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={(_, node) => onSelectTurn(node.id)}
        onPaneClick={() => onSelectTurn(null)}
        onInit={(instance) => {
          flowRef.current = instance;
          onFlowReady?.(instance);
          window.requestAnimationFrame(() =>
            void instance.fitView({ padding: 0.22, maxZoom: 1 }),
          );
        }}
        minZoom={0.2}
        maxZoom={1.65}
        fitViewOptions={{ padding: 0.22, maxZoom: 1 }}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: false }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1}
          color={BACKGROUND_DOT_COLORS[theme]}
        />
        <Controls position="bottom-left" showInteractive={false} className="graph-controls" />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          nodeStrokeWidth={2}
          nodeColor={(node) =>
            (node.data as PiTurnData).turn.onActivePath
              ? MINIMAP_COLORS[theme].active
              : MINIMAP_COLORS[theme].abandoned
          }
          maskColor={MINIMAP_COLORS[theme].mask}
          className="graph-minimap"
        />
      </ReactFlow>
    </div>
  );
}
