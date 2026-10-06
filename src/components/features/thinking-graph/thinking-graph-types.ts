import type { EventTitleDescriptor } from "#/components/conversation-events/chat/event-content-helpers/get-action-event-title";
import type { TaskItem } from "#/types/agent-server/core/base/common";

export type ThinkingNodeKind =
  | "goal"
  | "thought"
  | "tool"
  | "plan"
  | "fork"
  | "agent"
  | "result"
  | "reply"
  | "finish"
  | "error"
  | "cluster";

export type ThinkingNodeStatus = "running" | "done" | "error";

/** Which way the snake row this node sits on is growing. */
export type FlowDirection = "ltr" | "rtl";

export type ToolCategory =
  | "terminal"
  | "file"
  | "search"
  | "browser"
  | "mcp"
  | "other";

// A `type` (not `interface`) so it satisfies React Flow's
// `Record<string, unknown>` node-data constraint.
export type ThinkingGraphNode = {
  id: string;
  kind: ThinkingNodeKind;
  /** 0 = the main agent; 1.. = one lane per delegated sub-agent. */
  lane: number;
  status: ThinkingNodeStatus;
  /** Plain-text label (already trimmed); empty when `title` should be used. */
  label: string;
  /** Translatable title for tool nodes, rendered by the node component. */
  title?: EventTitleDescriptor;
  toolCategory?: ToolCategory;
  /** Source event, for the detail drawer. Absent on synthetic nodes. */
  eventId?: string;
  /** Plan checklist (plan nodes only). */
  items?: TaskItem[];
  /** Number of folded nodes (cluster nodes only). */
  count?: number;
  /** Creation order — drives the "grow" replay. */
  order: number;
  x: number;
  y: number;
  flow: FlowDirection;
};

export interface ThinkingGraphEdge {
  id: string;
  source: string;
  target: string;
  lane: number;
  /** True while the target node is still running — particles flow. */
  active: boolean;
}

export interface ThinkingGraph {
  nodes: ThinkingGraphNode[];
  edges: ThinkingGraphEdge[];
  /** Sub-agent lane labels, index-aligned with `lane - 1`. */
  lanes: string[];
  /** True once the agent called finish (or replied) after the last goal. */
  isFinished: boolean;
}
