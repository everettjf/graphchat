import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  applyNodeChanges,
  type ReactFlowInstance,
} from "@xyflow/react";
import { Focus, LayoutGrid, Network } from "lucide-react";
import "@xyflow/react/dist/style.css";
import type { GraphDocument, GraphNode } from "@shared/types";
import { GraphNodeCard, type GraphNodeData } from "./graph-node-card";
import { useWorkspace } from "@/store/workspace";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n";

const nodeTypes = { graphNode: GraphNodeCard };

type GraphCanvasProps = {
  document: GraphDocument;
  setDocument: (updater: (document: GraphDocument) => GraphDocument) => void;
  onFlowReady?: (instance: GraphFlowInstance) => void;
};

export type GraphFlowInstance = ReactFlowInstance<Node<GraphNodeData>, Edge>;

export function GraphCanvas({ document, setDocument, onFlowReady }: GraphCanvasProps) {
  const { t } = useI18n();
  const selectedNodeId = useWorkspace((state) => state.selectedNodeId);
  const referenceNodeIds = useWorkspace((state) => state.referenceNodeIds);
  const search = useWorkspace((state) => state.search.trim().toLocaleLowerCase());
  const selectNode = useWorkspace((state) => state.selectNode);
  const flowRef = useRef<GraphFlowInstance | null>(null);
  const [collapsedRoots, setCollapsedRoots] = useState<Set<string>>(new Set());

  const hiddenNodeIds = useMemo(() => {
    const hidden = new Set<string>();
    const outgoing = new Map<string, string[]>();
    for (const edge of document.edges) {
      if (edge.kind !== "branch") continue;
      outgoing.set(edge.source, [...(outgoing.get(edge.source) || []), edge.target]);
    }
    for (const root of collapsedRoots) {
      const queue = [...(outgoing.get(root) || [])];
      while (queue.length) {
        const id = queue.shift()!;
        if (hidden.has(id)) continue;
        hidden.add(id);
        queue.push(...(outgoing.get(id) || []));
      }
    }
    return hidden;
  }, [collapsedRoots, document.edges]);

  const projectedNodes = useMemo<Node<GraphNodeData>[]>(
    () =>
      document.nodes.filter((node) => !hiddenNodeIds.has(node.id)).map((node) => {
        const kindLabel =
          node.kind === "concept"
            ? `${t("node.concept")} ${t("sidebar.insightCards")}`
            : node.kind === "summary"
              ? t("node.summary")
              : t("node.answer");
        const haystack =
          `${node.title} ${node.prompt} ${node.content} ${node.summary} ${node.kind} ${kindLabel}`.toLocaleLowerCase();
        return {
          id: node.id,
          type: "graphNode",
          position: { x: node.x, y: node.y },
          selected: node.id === selectedNodeId,
          data: {
            node,
            dimmed: Boolean(search) && !haystack.includes(search),
            referenced: referenceNodeIds.includes(node.id),
          },
        };
      }),
    [document.nodes, hiddenNodeIds, referenceNodeIds, search, selectedNodeId, t],
  );
  const [nodes, setNodes] = useState(projectedNodes);

  useEffect(() => {
    setNodes((current) => {
      const previousById = new Map(current.map((node) => [node.id, node]));
      return projectedNodes.map((node) => {
        const previous = previousById.get(node.id);
        return previous?.measured ? { ...node, measured: previous.measured } : node;
      });
    });
  }, [projectedNodes]);

  const edges = useMemo<Edge[]>(
    () =>
      document.edges
        .filter((edge) => !hiddenNodeIds.has(edge.source) && !hiddenNodeIds.has(edge.target))
        .map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        type: edge.kind === "reference" ? "bezier" : "smoothstep",
        animated:
          document.nodes.find((node) => node.id === edge.target)?.status === "streaming",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 13,
          height: 13,
          color: edge.kind === "reference" ? "#a69ac2" : "#9cab9f",
        },
        style: {
          stroke: edge.kind === "reference" ? "#a69ac2" : "#aeb8ad",
          strokeWidth: edge.kind === "reference" ? 1.4 : 1.6,
          strokeDasharray: edge.kind === "reference" ? "5 5" : undefined,
        },
        labelStyle: {
          fill: edge.kind === "reference" ? "#786d8f" : "#737c74",
          fontSize: 9,
          fontWeight: 600,
        },
        labelBgStyle: { fill: "#f7f5ef", fillOpacity: 0.92 },
        labelBgPadding: [5, 3],
        labelBgBorderRadius: 6,
      })),
    [document.edges, document.nodes, hiddenNodeIds],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<GraphNodeData>>[]) => {
      setNodes((current) => applyNodeChanges<Node<GraphNodeData>>(changes, current));

      const positions = new Map(
        changes
          .filter(
            (
              change,
            ): change is Extract<NodeChange, { type: "position" }> =>
              change.type === "position" && Boolean(change.position),
          )
          .map((change) => [change.id, change.position!]),
      );
      if (positions.size === 0) return;

      setDocument((current) => ({
        ...current,
        nodes: current.nodes.map((node) => {
          const position = positions.get(node.id);
          return position ? { ...node, x: position.x, y: position.y } : node;
        }),
      }));
    },
    [setDocument],
  );

  const savePosition = useCallback((_event: unknown, flowNode: Node) => {
    void api.updateNode(flowNode.id, { x: flowNode.position.x, y: flowNode.position.y });
  }, []);

  return (
    <div className="relative h-full w-full" data-testid="graph-canvas">
      <div className="absolute left-4 top-4 z-10 flex gap-2">
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white/85 px-2.5 text-[10px] font-medium text-[var(--muted)] shadow-sm"
          onClick={() => {
            if (!selectedNodeId) return;
            setCollapsedRoots((current) => {
              const next = new Set(current);
              if (next.has(selectedNodeId)) next.delete(selectedNodeId);
              else next.add(selectedNodeId);
              return next;
            });
          }}
          disabled={!selectedNodeId}
          title={t("topbar.fit")}
        >
          <Network className="size-3" />
          {collapsedRoots.has(selectedNodeId || "") ? "Expand" : "Collapse"}
        </button>
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white/85 px-2.5 text-[10px] font-medium text-[var(--muted)] shadow-sm"
          onClick={() => {
            if (!selectedNodeId) return;
            void flowRef.current?.fitView({
              nodes: [{ id: selectedNodeId }],
              padding: 1.2,
              duration: 350,
              maxZoom: 1.15,
            });
          }}
          disabled={!selectedNodeId}
        >
          <Focus className="size-3" /> Focus
        </button>
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white/85 px-2.5 text-[10px] font-medium text-[var(--muted)] shadow-sm"
          onClick={() => {
            const incoming = new Set(
              document.edges
                .filter((edge) => edge.kind === "branch")
                .map((edge) => edge.target),
            );
            const roots = document.nodes.filter((node) => !incoming.has(node.id));
            const children = new Map<string, string[]>();
            for (const edge of document.edges) {
              if (edge.kind !== "branch") continue;
              children.set(edge.source, [...(children.get(edge.source) || []), edge.target]);
            }
            const positions = new Map<string, { x: number; y: number }>();
            const queue = roots.map((node, index) => ({ id: node.id, depth: 0, lane: index }));
            const depthCounts = new Map<number, number>();
            while (queue.length) {
              const current = queue.shift()!;
              const order = depthCounts.get(current.depth) || 0;
              depthCounts.set(current.depth, order + 1);
              positions.set(current.id, { x: 60 + current.depth * 360, y: 40 + order * 220 });
              for (const child of children.get(current.id) || []) {
                queue.push({ id: child, depth: current.depth + 1, lane: order });
              }
            }
            const nextNodes = document.nodes.map((node) => ({
              ...node,
              ...(positions.get(node.id) || {}),
            }));
            setDocument((current) => ({ ...current, nodes: nextNodes }));
            void Promise.all(
              nextNodes.map((node) => api.updateNode(node.id, { x: node.x, y: node.y })),
            ).then(() => flowRef.current?.fitView({ padding: 0.18, duration: 450 }));
          }}
        >
          <LayoutGrid className="size-3" /> Layout
        </button>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => selectNode(node.id)}
        onNodeDoubleClick={(_, node) => {
          setCollapsedRoots((current) => {
            const next = new Set(current);
            if (next.has(node.id)) next.delete(node.id);
            else next.add(node.id);
            return next;
          });
        }}
        onPaneClick={() => selectNode(null)}
        onNodeDragStop={savePosition}
        onInit={(instance) => {
          flowRef.current = instance;
          onFlowReady?.(instance);
        }}
        minZoom={0.35}
        maxZoom={1.65}
        defaultViewport={{ x: 70, y: 70, zoom: 0.76 }}
        fitViewOptions={{ padding: 0.18 }}
        deleteKeyCode={null}
        selectionKeyCode="Shift"
        multiSelectionKeyCode="Shift"
        proOptions={{ hideAttribution: false }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1}
          color="#d5d4cc"
        />
        <Controls
          position="bottom-left"
          showInteractive={false}
          className="graph-controls"
        />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          nodeStrokeWidth={2}
          nodeColor={(node) => {
            const graphNode = (node.data as GraphNodeData).node;
            if (graphNode.kind === "summary") return "#b4a8cf";
            if (graphNode.kind === "concept") return "#e5c883";
            return "#98c4a6";
          }}
          maskColor="rgba(245,243,237,.72)"
          className="graph-minimap"
        />
      </ReactFlow>
    </div>
  );
}
