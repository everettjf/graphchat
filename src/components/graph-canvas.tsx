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
import "@xyflow/react/dist/style.css";
import type { GraphDocument, GraphNode } from "@shared/types";
import { GraphNodeCard, type GraphNodeData } from "./graph-node-card";
import { useWorkspace } from "@/store/workspace";
import { api } from "@/lib/api";

const nodeTypes = { graphNode: GraphNodeCard };

type GraphCanvasProps = {
  document: GraphDocument;
  setDocument: (updater: (document: GraphDocument) => GraphDocument) => void;
  onFlowReady?: (instance: GraphFlowInstance) => void;
};

export type GraphFlowInstance = ReactFlowInstance<Node<GraphNodeData>, Edge>;

export function GraphCanvas({ document, setDocument, onFlowReady }: GraphCanvasProps) {
  const selectedNodeId = useWorkspace((state) => state.selectedNodeId);
  const referenceNodeIds = useWorkspace((state) => state.referenceNodeIds);
  const search = useWorkspace((state) => state.search.trim().toLocaleLowerCase());
  const selectNode = useWorkspace((state) => state.selectNode);
  const flowRef = useRef<GraphFlowInstance | null>(null);

  const projectedNodes = useMemo<Node<GraphNodeData>[]>(
    () =>
      document.nodes.map((node) => {
        const kindLabel =
          node.kind === "concept" ? "概念 理解卡" : node.kind === "summary" ? "汇聚 总结" : "回答";
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
    [document.nodes, referenceNodeIds, search, selectedNodeId],
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
      document.edges.map((edge) => ({
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
    [document.edges, document.nodes],
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
    <div className="h-full w-full" data-testid="graph-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => selectNode(node.id)}
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
