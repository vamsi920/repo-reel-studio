import type {
  ActionEvent,
  OpenHandsEvent,
  ObservationEvent,
} from "#/types/agent-server/core";
import type { TaskItem } from "#/types/agent-server/core/base/common";
import type { ACPToolCallEvent } from "#/types/agent-server/core/events/acp-tool-call-event";
import {
  isACPToolCallEvent,
  isActionEvent,
  isAgentErrorEvent,
  isConversationErrorEvent,
  isMessageEvent,
  isObservationEvent,
  isServerErrorEvent,
} from "#/types/agent-server/type-guards";
import {
  getActionThoughtText,
  getReasoningContent,
} from "#/components/conversation-events/chat/event-thought-helpers";
import {
  getActionEventTitleDescriptor,
  trimEventTitleText,
} from "#/components/conversation-events/chat/event-content-helpers/get-action-event-title";
import type {
  ThinkingGraph,
  ThinkingGraphEdge,
  ThinkingGraphNode,
  FlowDirection,
  ThinkingNodeStatus,
  ToolCategory,
} from "./thinking-graph-types";

/** Horizontal distance between consecutive steps. */
export const COLUMN_WIDTH = 250;
/** Main-line steps per row before the snake turns around. */
export const ROW_COLUMNS = 4;
/** Vertical distance between snake rows (before any sub-agent lanes). */
const ROW_HEIGHT = 230;
/** Slots a fork occupies on its row: fork, agent orb, result. */
const FORK_SPAN = 3;
/** Vertical distance between agent lanes. */
export const LANE_HEIGHT = 170;
/** Runs of at least this many finished same-kind tool steps fold into one. */
export const CLUSTER_MIN = 5;
const LABEL_MAX = 90;

const oneLine = (text: string, max = LABEL_MAX): string =>
  trimEventTitleText(text.replace(/\s+/g, " ").trim(), max);

const messageText = (event: OpenHandsEvent): string => {
  if (!isMessageEvent(event)) return "";
  return event.llm_message.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join(" ");
};

function toolCategoryOf(action: ActionEvent): ToolCategory {
  const kind = action.action.kind;
  if (kind === "ExecuteBashAction" || kind === "TerminalAction") {
    return "terminal";
  }
  if (kind.startsWith("Browser")) return "browser";
  if (kind === "MCPToolAction") return "mcp";
  if (/Glob|Grep|Search/i.test(kind)) return "search";
  if (/File|Editor/i.test(kind)) return "file";
  return "other";
}

function acpCategoryOf(event: ACPToolCallEvent): ToolCategory {
  switch (event.tool_kind) {
    case "execute":
      return "terminal";
    case "edit":
    case "read":
      return "file";
    case "fetch":
      return "browser";
    default:
      return "other";
  }
}

function observationStatus(observation: ObservationEvent): ThinkingNodeStatus {
  const body = observation.observation as {
    is_error?: boolean;
    exit_code?: number | null;
  };
  if (body.is_error === true) return "error";
  if (typeof body.exit_code === "number" && body.exit_code > 0) return "error";
  return "done";
}

function acpStatus(event: ACPToolCallEvent): ThinkingNodeStatus {
  if (event.is_error || event.status === "failed") return "error";
  if (event.status === "completed") return "done";
  return "running";
}

type DraftNode = Omit<ThinkingGraphNode, "x" | "y" | "order" | "flow"> & {
  /** Main-lane node this sub-agent node hangs off (sub-agent lanes only). */
  forkId?: string;
  /** Column offset inside a sub-agent lane (1 = agent orb, 2 = result). */
  laneSlot?: number;
};

/**
 * Turns the raw conversation event history into a 2D graph: one main line for
 * the primary agent that grows left → right, thoughts lifted above it, and a
 * separate colored lane per delegated sub-agent that forks off and joins back.
 *
 * Pure and deterministic: node ids are event ids, so React keeps existing
 * nodes mounted and only brand-new ones play their "birth" animation.
 */
export function buildThinkingGraph(
  events: readonly OpenHandsEvent[],
  expandedClusters: ReadonlySet<string> = new Set(),
): ThinkingGraph {
  const nodes = new Map<string, DraftNode>();
  const creation: string[] = [];
  const mainLine: string[] = [];
  const edges: ThinkingGraphEdge[] = [];
  const lanes: string[] = [];
  const nodeByActionId = new Map<string, string>();
  const nodeByToolCallId = new Map<string, string>();
  const laneTailByActionId = new Map<string, string>();

  let cursor: string[] = [];
  let lastForkResponseId: string | null = null;
  let lastForkId: string | null = null;
  let isFinished = false;

  const addNode = (node: DraftNode) => {
    nodes.set(node.id, node);
    creation.push(node.id);
  };
  const connect = (source: string, target: string, lane: number) => {
    edges.push({
      id: `${source}->${target}`,
      source,
      target,
      lane,
      active: false,
    });
  };
  /** Append a node to the main line, joining every open branch into it. */
  const pushMain = (node: DraftNode) => {
    addNode(node);
    mainLine.push(node.id);
    for (const source of cursor) connect(source, node.id, 0);
    cursor = [node.id];
  };

  for (const event of events) {
    if (isMessageEvent(event)) {
      const text = oneLine(messageText(event));
      if (event.llm_message.role === "user") {
        isFinished = false;
        pushMain({
          id: event.id,
          kind: "goal",
          lane: 0,
          status: "done",
          label: text,
          eventId: event.id,
        });
      } else if (event.llm_message.role === "assistant" && text) {
        isFinished = true;
        pushMain({
          id: event.id,
          kind: "reply",
          lane: 0,
          status: "done",
          label: text,
          eventId: event.id,
        });
      }
    } else if (isActionEvent(event)) {
      const { kind } = event.action;
      const thought = oneLine(
        getActionThoughtText(event) || getReasoningContent(event),
      );
      if (thought && kind !== "ThinkAction") {
        pushMain({
          id: `${event.id}:thought`,
          kind: "thought",
          lane: 0,
          status: "done",
          label: thought,
          eventId: event.id,
        });
      }

      if (kind === "ThinkAction") {
        const action = event.action as { thought: string };
        pushMain({
          id: event.id,
          kind: "thought",
          lane: 0,
          status: "done",
          label: oneLine(action.thought || thought),
          eventId: event.id,
        });
      } else if (kind === "FinishAction") {
        isFinished = true;
        const action = event.action as { message: string };
        pushMain({
          id: event.id,
          kind: "finish",
          lane: 0,
          status: "done",
          label: oneLine(action.message),
          eventId: event.id,
        });
      } else if (kind === "TaskTrackerAction") {
        const action = event.action as {
          command: string;
          task_list: TaskItem[];
        };
        if (action.command === "plan") {
          pushMain({
            id: event.id,
            kind: "plan",
            lane: 0,
            status: "done",
            label: "",
            items: action.task_list,
            eventId: event.id,
          });
          nodeByActionId.set(event.id, event.id);
        }
      } else if (kind === "TaskAction") {
        const action = event.action as {
          subagent_type: string;
          description?: string | null;
          prompt: string;
        };
        // Sub-agent calls emitted in the same LLM response run side by side:
        // share one fork node so the graph visibly splits the work.
        const responseId = event.llm_response_id || event.id;
        let forkId: string | null = lastForkId;
        if (!forkId || lastForkResponseId !== responseId) {
          forkId = `${event.id}:fork`;
          pushMain({
            id: forkId,
            kind: "fork",
            lane: 0,
            status: "running",
            label: "",
          });
          cursor = [];
          lastForkId = forkId;
          lastForkResponseId = responseId;
        }
        lanes.push(action.subagent_type || "agent");
        const lane = lanes.length;
        addNode({
          id: event.id,
          kind: "agent",
          lane,
          status: "running",
          label: oneLine(action.description || action.prompt, 60),
          eventId: event.id,
          forkId,
          laneSlot: 1,
        });
        connect(forkId, event.id, lane);
        laneTailByActionId.set(event.id, event.id);
        nodeByActionId.set(event.id, event.id);
        cursor.push(event.id);
        continue;
      } else {
        pushMain({
          id: event.id,
          kind: "tool",
          lane: 0,
          status: "running",
          label: "",
          title: getActionEventTitleDescriptor(event),
          toolCategory: toolCategoryOf(event),
          eventId: event.id,
        });
        nodeByActionId.set(event.id, event.id);
        nodeByToolCallId.set(event.tool_call_id, event.id);
      }
      lastForkId = null;
    } else if (isObservationEvent(event)) {
      const nodeId = nodeByActionId.get(event.action_id);
      const node = nodeId ? nodes.get(nodeId) : undefined;
      if (!node) continue;
      const status = observationStatus(event);
      if (node.kind === "agent") {
        node.status = status;
        const resultId = `${event.id}:result`;
        addNode({
          id: resultId,
          kind: "result",
          lane: node.lane,
          status,
          label: "",
          eventId: event.id,
          forkId: node.forkId,
          laneSlot: 2,
        });
        connect(node.id, resultId, node.lane);
        cursor = cursor.map((id) => (id === node.id ? resultId : id));
        laneTailByActionId.set(event.action_id, resultId);
        const forkNode = node.forkId ? nodes.get(node.forkId) : undefined;
        if (forkNode) {
          const stillRunning = [...nodes.values()].some(
            (n) =>
              n.kind === "agent" &&
              n.forkId === forkNode.id &&
              n.status === "running",
          );
          forkNode.status = stillRunning ? "running" : "done";
        }
      } else if (node.kind === "plan") {
        const body = event.observation as { task_list?: TaskItem[] };
        if (body.task_list) node.items = body.task_list;
      } else {
        node.status = status;
      }
    } else if (isACPToolCallEvent(event)) {
      const existing = nodeByToolCallId.get(event.tool_call_id);
      const node = existing ? nodes.get(existing) : undefined;
      if (node) {
        node.status = acpStatus(event);
        if (event.title) node.label = oneLine(event.title);
      } else {
        pushMain({
          id: event.id,
          kind: "tool",
          lane: 0,
          status: acpStatus(event),
          label: oneLine(event.title || event.tool_kind || ""),
          toolCategory: acpCategoryOf(event),
          eventId: event.id,
        });
        nodeByToolCallId.set(event.tool_call_id, event.id);
      }
    } else if (isAgentErrorEvent(event)) {
      const existing = nodeByToolCallId.get(event.tool_call_id);
      const node = existing ? nodes.get(existing) : undefined;
      if (node) {
        node.status = "error";
      } else {
        const id = event.id ?? `error-${creation.length}`;
        pushMain({
          id,
          kind: "error",
          lane: 0,
          status: "error",
          label: oneLine(event.error),
          eventId: id,
        });
      }
    } else if (isConversationErrorEvent(event) || isServerErrorEvent(event)) {
      const detail = (event as { detail?: string }).detail ?? "";
      const id = event.id ?? `error-${creation.length}`;
      pushMain({
        id,
        kind: "error",
        lane: 0,
        status: "error",
        label: oneLine(detail),
        eventId: id,
      });
    }
  }

  // Once the agent is finished nothing can still be "running".
  if (isFinished) {
    for (const node of nodes.values()) {
      if (node.status === "running") node.status = "done";
    }
  }

  const clusterOf = foldToolRuns(mainLine, nodes, expandedClusters);
  return layout({
    nodes,
    creation,
    mainLine,
    edges,
    lanes,
    clusterOf,
    isFinished,
  });
}

/**
 * Folds long runs of finished same-category tool steps on the main line into a
 * single "×N" cluster node so a 60-step bash marathon doesn't swallow the
 * canvas. The newest node is never folded, and clicking a cluster expands it.
 * Returns member id → cluster id; cluster nodes are added to `nodes`.
 */
function foldToolRuns(
  mainLine: string[],
  nodes: Map<string, DraftNode>,
  expandedClusters: ReadonlySet<string>,
): Map<string, string> {
  const clusterOf = new Map<string, string>();
  let run: DraftNode[] = [];
  const flush = () => {
    const clusterId = run.length ? `${run[0].id}:cluster` : "";
    if (run.length >= CLUSTER_MIN && !expandedClusters.has(clusterId)) {
      const first = run[0];
      nodes.set(clusterId, {
        id: clusterId,
        kind: "cluster",
        lane: 0,
        status: run.some((n) => n.status === "error") ? "error" : "done",
        label: "",
        toolCategory: first.toolCategory,
        count: run.length,
      });
      for (const member of run) clusterOf.set(member.id, clusterId);
    }
    run = [];
  };
  const foldable = mainLine.slice(0, -1);
  for (const id of foldable) {
    const node = nodes.get(id)!;
    const fits =
      node.kind === "tool" &&
      node.status !== "running" &&
      (run.length === 0 || run[0].toolCategory === node.toolCategory);
    if (!fits) flush();
    if (node.kind === "tool" && node.status !== "running") run.push(node);
  }
  flush();
  return clusterOf;
}

function layout({
  nodes,
  creation,
  mainLine,
  edges,
  lanes,
  clusterOf,
  isFinished,
}: {
  nodes: Map<string, DraftNode>;
  creation: string[];
  mainLine: string[];
  edges: ThinkingGraphEdge[];
  lanes: string[];
  clusterOf: Map<string, string>;
  isFinished: boolean;
}): ThinkingGraph {
  // Snake layout: the main line fills a row left → right, U-turns, and fills
  // the next row right → left, so the graph grows as a 2D board instead of
  // an ever-longer thread. A fork (and its sub-agent lanes) never straddles
  // a row break, and rows grow taller to make room for the lanes under them.
  const slotOf = new Map<string, number>();
  const forkSlot = new Map<string, number>();
  let slot = 0;
  const seenClusters = new Set<string>();
  for (const id of mainLine) {
    const clusterId = clusterOf.get(id);
    if (clusterId) {
      if (seenClusters.has(clusterId)) continue;
      seenClusters.add(clusterId);
      slotOf.set(clusterId, slot);
      slot += 1;
      continue;
    }
    const node = nodes.get(id)!;
    if (node.kind === "fork") {
      if (slot % ROW_COLUMNS > ROW_COLUMNS - FORK_SPAN) {
        slot += ROW_COLUMNS - (slot % ROW_COLUMNS);
      }
      forkSlot.set(id, slot);
      slotOf.set(id, slot);
      slot += FORK_SPAN; // fork → agent orb → result, then the join
    } else {
      slotOf.set(id, slot);
      slot += 1;
    }
  }

  // Lane depth (1 = first sub-agent of that fork) and lanes per row.
  const firstLaneOfFork = new Map<string, number>();
  for (const node of nodes.values()) {
    if (node.lane === 0 || !node.forkId) continue;
    const first = firstLaneOfFork.get(node.forkId);
    if (first === undefined || node.lane < first) {
      firstLaneOfFork.set(node.forkId, node.lane);
    }
  }
  const laneDepth = (node: DraftNode) =>
    node.lane - (firstLaneOfFork.get(node.forkId!) ?? node.lane) + 1;
  const rowCount = Math.floor(Math.max(slot - 1, 0) / ROW_COLUMNS) + 1;
  const lanesInRow = new Array<number>(rowCount).fill(0);
  for (const node of nodes.values()) {
    if (node.lane === 0 || !node.forkId) continue;
    const row = Math.floor((forkSlot.get(node.forkId) ?? 0) / ROW_COLUMNS);
    lanesInRow[row] = Math.max(lanesInRow[row], laneDepth(node));
  }
  const rowY: number[] = [];
  let y = 0;
  for (let row = 0; row < rowCount; row += 1) {
    rowY.push(y);
    y += ROW_HEIGHT + lanesInRow[row] * LANE_HEIGHT;
  }

  const position = (atSlot: number) => {
    const row = Math.floor(atSlot / ROW_COLUMNS);
    const inRow = atSlot % ROW_COLUMNS;
    const flow: FlowDirection = row % 2 === 0 ? "ltr" : "rtl";
    const column = flow === "ltr" ? inRow : ROW_COLUMNS - 1 - inRow;
    return { x: column * COLUMN_WIDTH, y: rowY[row], flow };
  };

  const placed = new Map<
    string,
    { x: number; y: number; flow: FlowDirection }
  >();
  for (const [id, atSlot] of slotOf) {
    placed.set(id, position(atSlot));
  }
  // Sub-agent lanes hang below their fork's row, continuing its direction.
  for (const node of nodes.values()) {
    if (node.lane === 0 || !node.forkId) continue;
    const base = position(
      (forkSlot.get(node.forkId) ?? 0) + (node.laneSlot ?? 1),
    );
    placed.set(node.id, { ...base, y: base.y + laneDepth(node) * LANE_HEIGHT });
  }

  const resolve = (id: string) => clusterOf.get(id) ?? id;
  const orderOf = new Map<string, number>();
  creation.forEach((id) => {
    const key = resolve(id);
    if (!orderOf.has(key)) orderOf.set(key, orderOf.size);
  });

  const outNodes: ThinkingGraphNode[] = [];
  for (const [id, position] of placed) {
    const node: Partial<DraftNode> = { ...nodes.get(id)! };
    delete node.forkId;
    delete node.laneSlot;
    outNodes.push({
      ...(node as DraftNode),
      ...position,
      order: orderOf.get(id) ?? 0,
    });
  }
  outNodes.sort((a, b) => a.order - b.order);

  const statusOf = new Map(outNodes.map((n) => [n.id, n.status]));
  const seenEdges = new Set<string>();
  const outEdges: ThinkingGraphEdge[] = [];
  for (const edge of edges) {
    const source = resolve(edge.source);
    const target = resolve(edge.target);
    const id = `${source}->${target}`;
    if (source === target || seenEdges.has(id)) continue;
    seenEdges.add(id);
    outEdges.push({
      ...edge,
      id,
      source,
      target,
      active: !isFinished && statusOf.get(target) === "running",
    });
  }

  return { nodes: outNodes, edges: outEdges, lanes, isFinished };
}
