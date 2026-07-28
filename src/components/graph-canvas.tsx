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
import {
  GRAPH_NODE_WIDTH,
  GRAPH_ROW_GAP,
  getGraphDepth,
  layoutGraphNodes,
} from "@/lib/graph-layout";

const nodeTypes = { graphNode: GraphNodeCard };

type GraphCanvasProps = {
  document: GraphDocument;
  setDocument: (updater: (document: GraphDocument) => GraphDocument) => void;
  onFlowReady?: (instance: GraphFlowInstance) => void;
  onNodeOpen?: (nodeId: string) => void;
  onError?: (message: string) => void;
};

export type GraphFlowInstance = ReactFlowInstance<Node<GraphNodeData>, Edge>;

export function GraphCanvas({
  document,
  setDocument,
  onFlowReady,
  onNodeOpen,
  onError,
}: GraphCanvasProps) {
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
      if (edge.kind !== "branch" && edge.kind !== "continuation") continue;
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
        const incomingRelation = document.edges.find(
          (edge) =>
            edge.target === node.id &&
            (edge.kind === "branch" || edge.kind === "continuation"),
        );
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
            relationKind:
              incomingRelation?.kind === "branch" ||
              incomingRelation?.kind === "continuation"
                ? incomingRelation.kind
                : null,
          },
        };
      }),
    [document.edges, document.nodes, hiddenNodeIds, referenceNodeIds, search, selectedNodeId, t],
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
        label:
          edge.kind === "reference"
            ? "Reference"
            : edge.kind === "supports"
              ? "Supports"
              : edge.kind === "contradicts"
                ? "Contradicts"
                : undefined,
        type: edge.kind === "reference" ? "bezier" : "smoothstep",
        animated:
          document.nodes.find((node) => node.id === edge.target)?.status === "streaming",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 12,
          height: 12,
          color:
            edge.kind === "reference"
              ? "#a69ac2"
              : edge.kind === "continuation"
                ? "#aab5ae"
                : "#89a993",
        },
        style: {
          stroke:
            edge.kind === "reference"
              ? "#a69ac2"
              : edge.kind === "continuation"
                ? "#aab5ae"
                : "#91aa99",
          strokeWidth: edge.kind === "reference" ? 1.35 : 1.55,
          strokeDasharray:
            edge.kind === "reference"
              ? "5 5"
              : edge.kind === "continuation"
                ? "7 5"
                : undefined,
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

  const applyAutomaticLayout = useCallback(async () => {
    const previousNodes = document.nodes;
    const nextNodes = layoutGraphNodes(document.nodes, document.edges);
    setDocument((current) => ({ ...current, nodes: nextNodes }));
    try {
      await api.updateGraphLayout(document.graph.id, {
        positions: nextNodes.map((node) => ({
          id: node.id,
          x: node.x,
          y: node.y,
        })),
      });
      const top = Math.min(...nextNodes.map((node) => node.y));
      const readableWindow =
        nextNodes.length > 6
          ? nextNodes.filter((node) => node.y <= top + 720)
          : nextNodes;
      await flowRef.current?.fitView({
        nodes: readableWindow.map((node) => ({ id: node.id })),
        padding: 0.22,
        duration: 450,
        maxZoom: 0.95,
      });
    } catch {
      setDocument((current) => ({ ...current, nodes: previousNodes }));
      onError?.(t("graph.layoutFailed"));
    }
  }, [document.edges, document.graph.id, document.nodes, onError, setDocument, t]);

  return (
    <div className="relative h-full w-full" data-testid="graph-canvas">
      <div className="absolute left-4 top-4 z-10 flex gap-0 overflow-hidden rounded-xl border border-[var(--border)] bg-white/88 shadow-sm backdrop-blur">
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 border-r border-[var(--border)] px-2.5 text-[10px] font-medium text-[var(--muted)] hover:bg-black/[0.035]"
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
          {collapsedRoots.has(selectedNodeId || "")
            ? t("graph.expand")
            : t("graph.collapse")}
        </button>
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 border-r border-[var(--border)] px-2.5 text-[10px] font-medium text-[var(--muted)] hover:bg-black/[0.035]"
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
          <Focus className="size-3" /> {t("graph.focus")}
        </button>
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 px-2.5 text-[10px] font-medium text-[var(--muted)] hover:bg-black/[0.035]"
          onClick={() => void applyAutomaticLayout()}
        >
          <LayoutGrid className="size-3" /> {t("graph.layout")}
        </button>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => {
          selectNode(node.id);
          onNodeOpen?.(node.id);
        }}
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
          const incoming = new Set(
            document.edges
              .filter(
                (edge) =>
                  edge.kind === "branch" || edge.kind === "continuation",
              )
              .map((edge) => edge.target),
          );
          const root =
            document.nodes.find((node) => !incoming.has(node.id)) ||
            document.nodes[0];
          const selected =
            document.nodes.find((node) => node.id === selectedNodeId) || root;
          const graphDepth = getGraphDepth(document.nodes, document.edges);
          if (
            document.nodes.length > 1 &&
            document.nodes.length <= 24 &&
            graphDepth <= 3
          ) {
            window.requestAnimationFrame(() =>
              instance.fitView({
                padding: 0.24,
                maxZoom: 1,
              }),
            );
          } else if (selected) {
            const centerY =
              !incoming.has(selected.id) && document.nodes.length > 6
                ? selected.y + GRAPH_ROW_GAP * 2
                : selected.y + 80;
            window.requestAnimationFrame(() =>
              instance.setCenter(
                selected.x + GRAPH_NODE_WIDTH / 2,
                centerY,
                { zoom: 0.84 },
              ),
            );
          }
        }}
        minZoom={0.25}
        maxZoom={1.65}
        defaultViewport={{ x: 70, y: 70, zoom: 0.82 }}
        fitViewOptions={{ padding: 0.22, maxZoom: 1 }}
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
