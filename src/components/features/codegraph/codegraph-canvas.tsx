import React from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import CustomNode, {
  type CustomNodeData,
} from "../../../../vendor/understand-anything/dashboard/components/CustomNode";
import {
  applyElkLayout,
  type ElkInput,
} from "../../../../vendor/understand-anything/dashboard/utils/elk-layout";
import {
  ELK_DEFAULT_LAYOUT_OPTIONS,
  NODE_HEIGHT,
  NODE_WIDTH,
} from "../../../../vendor/understand-anything/dashboard/utils/layout";
import type {
  CodeGraphEdge,
  CodeGraphNode,
} from "#/lib/codegraph/codegraph-types";

/**
 * Above this many nodes a minimap earns its place; below it, it is chrome that
 * covers the graph without helping anyone.
 */
const MINIMAP_THRESHOLD = 12;

const nodeTypes = { custom: CustomNode };

export interface CodeGraphCanvasProps {
  nodes: CodeGraphNode[];
  edges: CodeGraphEdge[];
  selectedNodeId: string | null;
  /** Ids matching the current search, highlighted rather than filtered out. */
  highlightedIds: Set<string>;
  onSelect: (nodeId: string) => void;
  onDrillDown: (nodeId: string) => void;
}

/**
 * Neighbours of the selected node, so the canvas can fade everything else.
 * Reading a dependency edge in a busy graph is nearly impossible without it.
 */
function neighboursOf(
  selectedId: string | null,
  edges: CodeGraphEdge[],
): { upstream: Set<string>; downstream: Set<string> } {
  const upstream = new Set<string>();
  const downstream = new Set<string>();
  if (!selectedId) return { upstream, downstream };
  for (const edge of edges) {
    if (edge.source === selectedId) downstream.add(edge.target);
    if (edge.target === selectedId) upstream.add(edge.source);
  }
  return { upstream, downstream };
}

function CodeGraphCanvasInner({
  nodes,
  edges,
  selectedNodeId,
  highlightedIds,
  onSelect,
  onDrillDown,
}: CodeGraphCanvasProps) {
  const [flowNodes, setFlowNodes] = React.useState<Node<CustomNodeData>[]>([]);
  const [laidOut, setLaidOut] = React.useState(false);
  const { fitView } = useReactFlow();

  const { upstream, downstream } = React.useMemo(
    () => neighboursOf(selectedNodeId, edges),
    [selectedNodeId, edges],
  );

  const degrees = React.useMemo(() => {
    const incoming = new Map<string, number>();
    const outgoing = new Map<string, number>();
    for (const edge of edges) {
      outgoing.set(edge.source, (outgoing.get(edge.source) ?? 0) + 1);
      incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    }
    return { incoming, outgoing };
  }, [edges]);

  // Layout runs off the structural identity of the level only. Selection and
  // search change styling, and re-running ELK for those would make nodes jump
  // under the user's cursor.
  const structureKey = React.useMemo(
    () => `${nodes.map((node) => node.id).join("|")}::${edges.length}`,
    [nodes, edges],
  );

  React.useEffect(() => {
    let cancelled = false;
    setLaidOut(false);

    const input: ElkInput = {
      id: "root",
      layoutOptions: ELK_DEFAULT_LAYOUT_OPTIONS,
      children: nodes.map((node) => ({
        id: node.id,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      })),
      edges: edges.map((edge, index) => ({
        id: `e${index}`,
        sources: [edge.source],
        targets: [edge.target],
      })),
    };

    applyElkLayout(input).then(({ positioned }) => {
      if (cancelled) return;
      const positions = new Map(
        (positioned.children ?? []).map((child) => [
          child.id,
          { x: child.x ?? 0, y: child.y ?? 0 },
        ]),
      );
      setFlowNodes(
        nodes.map((node) => ({
          id: node.id,
          type: "custom" as const,
          position: positions.get(node.id) ?? { x: 0, y: 0 },
          data: {} as CustomNodeData,
        })),
      );
      setLaidOut(true);
    });

    return () => {
      cancelled = true;
    };
  }, [structureKey]);

  React.useEffect(() => {
    if (laidOut) {
      // Wait a frame so React Flow has measured the freshly positioned nodes.
      const handle = requestAnimationFrame(() =>
        fitView({ padding: 0.15, duration: 220 }),
      );
      return () => cancelAnimationFrame(handle);
    }
    return undefined;
  }, [laidOut, fitView]);

  const nodeById = React.useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );

  // A single click drills straight into any node with children (subsystem →
  // module → file → symbol), matching the vendored reference dashboard's own
  // click-to-navigate convention — no extra "Explore" step required. Leaf
  // nodes (symbols/functions, `childCount === 0`) have nothing to drill into,
  // so a click there selects instead, showing real source in the side panel.
  const handleNodeClick = React.useCallback(
    (nodeId: string) => {
      const target = nodeById.get(nodeId);
      if (target && target.childCount > 0) {
        onDrillDown(nodeId);
      } else {
        onSelect(nodeId);
      }
    },
    [nodeById, onDrillDown, onSelect],
  );

  // Styling is applied here rather than baked into layout state so search and
  // selection stay instant.
  const styledNodes = React.useMemo<Node<CustomNodeData>[]>(
    () =>
      flowNodes.map((flowNode) => {
        const node = nodeById.get(flowNode.id);
        if (!node) return flowNode;
        const isSelected = node.id === selectedNodeId;
        const isNeighbour = upstream.has(node.id) || downstream.has(node.id);
        return {
          ...flowNode,
          data: {
            label: node.name,
            nodeType: node.type,
            summary:
              node.summary ||
              (node.childCount > 0 ? `${node.childCount} items` : ""),
            complexity: node.complexity,
            isHighlighted: highlightedIds.has(node.id),
            isSelected,
            isTourHighlighted: false,
            isDiffChanged: false,
            isDiffAffected: false,
            isDiffFaded: false,
            isNeighbor: isNeighbour,
            isSelectionFaded: Boolean(
              selectedNodeId && !isSelected && !isNeighbour,
            ),
            incomingCount: degrees.incoming.get(node.id) ?? 0,
            outgoingCount: degrees.outgoing.get(node.id) ?? 0,
            tags: node.tags,
            onNodeClick: handleNodeClick,
          } satisfies CustomNodeData,
        };
      }),
    [
      flowNodes,
      nodeById,
      selectedNodeId,
      upstream,
      downstream,
      highlightedIds,
      degrees,
      handleNodeClick,
    ],
  );

  const flowEdges = React.useMemo<Edge[]>(
    () =>
      edges.map((edge, index) => {
        const touchesSelection =
          selectedNodeId != null &&
          (edge.source === selectedNodeId || edge.target === selectedNodeId);
        return {
          id: `e${index}`,
          source: edge.source,
          target: edge.target,
          animated: touchesSelection,
          label: edge.count && edge.count > 1 ? String(edge.count) : undefined,
          style: {
            stroke: touchesSelection
              ? "var(--oh-color-primary)"
              : "var(--oh-border)",
            strokeWidth: touchesSelection ? 2 : 1,
            opacity: selectedNodeId && !touchesSelection ? 0.25 : 1,
          },
        };
      }),
    [edges, selectedNodeId],
  );

  return (
    <ReactFlow
      className="codegraph-canvas"
      nodes={styledNodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      onNodeDoubleClick={(_event, node) => {
        const target = nodeById.get(node.id);
        // Leaves have nothing below them; a drill-down would dead-end.
        if (target && target.childCount > 0) onDrillDown(node.id);
      }}
      onPaneClick={() => onSelect("")}
      proOptions={{ hideAttribution: false }}
      minZoom={0.05}
      maxZoom={2}
      fitView
    >
      <Background gap={20} size={1} color="var(--oh-border)" />
      <Controls showInteractive={false} />
      {nodes.length > MINIMAP_THRESHOLD ? (
        <MiniMap pannable zoomable nodeStrokeWidth={2} />
      ) : null}
    </ReactFlow>
  );
}

export function CodeGraphCanvas(props: CodeGraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <CodeGraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
