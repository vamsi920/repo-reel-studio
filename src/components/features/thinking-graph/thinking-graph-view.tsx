import React from "react";
import { useTranslation } from "react-i18next";
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Crosshair, Maximize2, Play, X } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import type { OpenHandsEvent } from "#/types/agent-server/core";
import {
  isActionEvent,
  isMessageEvent,
  isObservationEvent,
} from "#/types/agent-server/type-guards";
import { getEventContent } from "#/components/conversation-events/chat/event-content-helpers/get-event-content";
import {
  buildActionsById,
  getActionThoughtText,
} from "#/components/conversation-events/chat/event-thought-helpers";
import { buildThinkingGraph } from "./build-thinking-graph";
import { useSubagentTraces } from "./use-subagent-traces";
import { laneColor, nodeAccent } from "./agent-palette";
import {
  ThinkingNode,
  useNodeText,
  type ThinkingFlowNode,
} from "./nodes/thinking-node";
import { ParticleEdge, type ParticleFlowEdge } from "./edges/particle-edge";
import type { ThinkingGraphNode } from "./thinking-graph-types";
import "./thinking-graph.css";

const nodeTypes = { thinking: ThinkingNode };
const edgeTypes = { particle: ParticleEdge };

/** Delay between nodes while replaying the graph's growth. */
const REPLAY_STEP_MS = 260;
const FOLLOW_ZOOM = 0.95;
const FIT_ALL_MAX_NODES = 28;
const NODE_CENTER_X = 105;
const NODE_CENTER_Y = 40;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function fullTextOf(
  node: ThinkingGraphNode,
  event: OpenHandsEvent | undefined,
  actionsById: ReturnType<typeof buildActionsById>,
): React.ReactNode {
  if (node.kind === "agent" && node.steps?.length) {
    return node.steps
      .map(
        (step) =>
          `${step.status === "error" ? "✗" : "•"} ${step.tool}  ${step.label}`,
      )
      .join("\n");
  }
  if (!event) return null;
  if (isMessageEvent(event)) {
    return event.llm_message.content
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("\n");
  }
  if (node.kind === "thought" && isActionEvent(event)) {
    const action = event.action as { kind: string; thought?: string };
    return action.kind === "ThinkAction"
      ? (action.thought ?? "")
      : getActionThoughtText(event);
  }
  const corresponding = isObservationEvent(event)
    ? actionsById.get(event.action_id)
    : undefined;
  return getEventContent(event, corresponding).details;
}

function NodeDrawer({
  node,
  event,
  actionsById,
  onClose,
}: {
  node: ThinkingGraphNode;
  event: OpenHandsEvent | undefined;
  actionsById: ReturnType<typeof buildActionsById>;
  onClose: () => void;
}) {
  const { t } = useTranslation("openhands");
  const { heading, body } = useNodeText(node);
  const accent = nodeAccent(node.kind, node.lane, node.toolCategory);
  const details = fullTextOf(node, event, actionsById);

  return (
    <aside
      data-testid="thinking-graph-drawer"
      className="absolute bottom-3 right-3 top-3 z-30 flex w-[min(380px,85%)] flex-col overflow-hidden rounded-sm border border-[var(--oh-border-subtle,#d9dee8)] bg-[var(--oh-surface,#ffffff)] shadow-xl"
    >
      <header
        className="flex items-center gap-2 border-b border-[var(--oh-border-subtle,#d9dee8)] px-4 py-2.5"
        style={{ borderTop: `3px solid ${accent}` }}
      >
        <span
          className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em]"
          style={{ color: accent }}
        >
          {heading}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t(I18nKey.THINKING_GRAPH$CLOSE)}
          className="ml-auto rounded p-1 text-[var(--oh-muted,#64748b)] hover:bg-[var(--oh-background,#f1f5f9)]"
        >
          <X size={14} />
        </button>
      </header>
      <div className="custom-scrollbar-always min-h-0 grow overflow-y-auto px-4 py-3 text-xs leading-relaxed text-[var(--oh-foreground,#0f172a)]">
        {body && <p className="mb-3 font-medium">{body}</p>}
        {typeof details === "string" ? (
          <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-[var(--oh-muted,#475569)]">
            {details}
          </pre>
        ) : (
          details
        )}
      </div>
    </aside>
  );
}

function ThinkingGraphCanvas({
  events,
}: {
  events: readonly OpenHandsEvent[];
}) {
  const { t } = useTranslation("openhands");
  const { setCenter, fitView, getZoom } = useReactFlow();
  const subagentTraces = useSubagentTraces(events);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [isFollowing, setIsFollowing] = React.useState(true);
  const [revealCount, setRevealCount] = React.useState<number | null>(null);

  const graph = React.useMemo(
    () => buildThinkingGraph(events, expanded, subagentTraces),
    [events, expanded, subagentTraces],
  );
  const eventsById = React.useMemo(
    () => new Map(events.map((event) => [event.id, event] as const)),
    [events],
  );
  const actionsById = React.useMemo(
    () => buildActionsById([...events]),
    [events],
  );

  const visibleNodes = React.useMemo(
    () =>
      revealCount === null
        ? graph.nodes
        : graph.nodes.filter((node) => node.order < revealCount),
    [graph.nodes, revealCount],
  );
  const visibleIds = React.useMemo(
    () => new Set(visibleNodes.map((node) => node.id)),
    [visibleNodes],
  );

  const flowNodes: ThinkingFlowNode[] = React.useMemo(
    () =>
      visibleNodes.map((node) => ({
        id: node.id,
        type: "thinking",
        position: { x: node.x, y: node.y },
        draggable: false,
        data: {
          ...node,
          laneLabel:
            node.kind === "agent" ? graph.lanes[node.lane - 1] : undefined,
        },
      })),
    [visibleNodes, graph.lanes],
  );
  const flowEdges: ParticleFlowEdge[] = React.useMemo(
    () =>
      graph.edges
        .filter(
          (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
        )
        .map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: "particle",
          data: { lane: edge.lane, active: edge.active },
        })),
    [graph.edges, visibleIds],
  );

  // Replay: re-grow the graph node by node from the event timeline.
  React.useEffect(() => {
    if (revealCount === null) return undefined;
    if (revealCount >= graph.nodes.length) {
      setRevealCount(null);
      return undefined;
    }
    const timer = window.setTimeout(
      () => setRevealCount((count) => (count ?? 0) + 1),
      REPLAY_STEP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [revealCount, graph.nodes.length]);

  // Camera glides to the newest node while following.
  const newest = visibleNodes[visibleNodes.length - 1];
  React.useEffect(() => {
    if (!newest || !isFollowing) return;
    const duration = prefersReducedMotion() ? 0 : 700;
    setCenter(newest.x + NODE_CENTER_X, newest.y + NODE_CENTER_Y, {
      zoom: Math.max(getZoom(), FOLLOW_ZOOM),
      duration,
    });
  }, [newest?.id, newest?.x, newest?.y, isFollowing, setCenter, getZoom]);

  // When the agent finishes, pull back to admire the whole graph — unless it
  // grew so big that "everything" would be unreadable specks.
  React.useEffect(() => {
    if (!graph.isFinished || revealCount !== null || graph.nodes.length < 2) {
      return;
    }
    if (graph.nodes.length <= FIT_ALL_MAX_NODES) {
      fitView({ duration: prefersReducedMotion() ? 0 : 900, padding: 0.15 });
    }
  }, [graph.isFinished, graph.nodes.length, revealCount, fitView]);

  const selected = selectedId
    ? graph.nodes.find((node) => node.id === selectedId)
    : undefined;
  const runningCount = graph.nodes.filter((n) => n.status === "running").length;

  const handleNodeClick = (_: React.MouseEvent, node: ThinkingFlowNode) => {
    if (node.data.kind === "cluster") {
      setExpanded((prev) => new Set(prev).add(node.id));
      return;
    }
    setSelectedId(node.id);
  };

  return (
    <div
      className="tg-canvas flex h-full w-full flex-col overflow-hidden"
      data-testid="thinking-graph"
    >
      {/* Header bar: the cast of agents on the left, controls on the right.
          Kept out of the canvas so it never covers a node. */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--oh-border-subtle,#d9dee8)] bg-[var(--oh-surface,#ffffff)] px-2 py-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {[t(I18nKey.THINKING_GRAPH$MAIN_AGENT), ...graph.lanes].map(
            (name, lane) => (
              <span
                // Lane index is the agent's identity in this graph.
                key={lane}
                className="flex items-center gap-1.5 rounded-sm border border-[var(--oh-border-subtle,#d9dee8)] px-2 py-0.5 font-mono text-[10px] font-medium text-[var(--oh-foreground,#0f172a)]"
              >
                <span
                  className="h-2 w-2 rounded-[2px]"
                  style={{ backgroundColor: laneColor(lane) }}
                />
                {name}
              </span>
            ),
          )}
          {runningCount > 0 && (
            <span className="px-1 font-mono text-[10px] text-[var(--oh-muted,#64748b)]">
              {runningCount} {t(I18nKey.THINKING_GRAPH$RUNNING)}
            </span>
          )}
        </div>
        {graph.nodes.length > 0 && (
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {!isFollowing && (
              <HudButton
                icon={<Crosshair size={12} />}
                label={t(I18nKey.THINKING_GRAPH$FOLLOW)}
                onClick={() => setIsFollowing(true)}
              />
            )}
            <HudButton
              icon={<Maximize2 size={12} />}
              label={t(I18nKey.THINKING_GRAPH$FIT)}
              onClick={() => {
                setIsFollowing(false);
                fitView({ duration: 600, padding: 0.2 });
              }}
            />
            <HudButton
              icon={<Play size={12} />}
              label={t(I18nKey.THINKING_GRAPH$REPLAY)}
              testId="thinking-graph-replay"
              onClick={() => {
                setSelectedId(null);
                setIsFollowing(true);
                setRevealCount(1);
              }}
            />
          </div>
        )}
      </div>

      <div className="relative min-h-0 grow">
        {graph.nodes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <span className="tg-seed" />
            <p className="font-mono text-xs text-[var(--oh-muted,#64748b)]">
              {t(I18nKey.THINKING_GRAPH$EMPTY)}
            </p>
          </div>
        ) : (
          // `isolate` keeps React Flow's internal z-indexes in their own
          // stacking context so the HUD overlay always stays on top.
          <div className="absolute inset-0 isolate">
            <ReactFlow
              style={{ background: "transparent" }}
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodeClick={handleNodeClick}
              onPaneClick={() => setSelectedId(null)}
              onMoveStart={(event) => {
                // Only a user drag/scroll carries an input event; programmatic
                // camera moves (follow/fit) don't, so they never unfollow.
                if (event) setIsFollowing(false);
              }}
              nodesConnectable={false}
              minZoom={0.15}
              maxZoom={1.8}
              proOptions={{ hideAttribution: true }}
              defaultViewport={{ x: 80, y: 160, zoom: FOLLOW_ZOOM }}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={14}
                size={1.8}
                color="#aab4c6"
              />
            </ReactFlow>
          </div>
        )}

        {selected && (
          <NodeDrawer
            node={selected}
            event={
              selected.eventId ? eventsById.get(selected.eventId) : undefined
            }
            actionsById={actionsById}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}

function HudButton({
  icon,
  label,
  onClick,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex items-center gap-1 rounded-sm border border-[var(--oh-border-subtle,#d9dee8)] bg-[var(--oh-surface,#ffffff)] px-2 py-1 font-mono text-[10px] font-medium text-[var(--oh-foreground,#0f172a)] shadow-sm transition hover:border-[#3b6cf6] hover:text-[#3b6cf6]"
    >
      {icon}
      {label}
    </button>
  );
}

export default function ThinkingGraphView({
  events,
}: {
  events: readonly OpenHandsEvent[];
}) {
  return (
    <ReactFlowProvider>
      <ThinkingGraphCanvas events={events} />
    </ReactFlowProvider>
  );
}
