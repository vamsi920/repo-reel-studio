import type { ThinkingNodeKind, ToolCategory } from "./thinking-graph-types";

/** Lane 0 is the main agent; each delegated sub-agent gets the next color. */
const LANE_COLORS = [
  "#3b6cf6", // main agent — brand blue
  "#a855f7", // violet
  "#14b8a6", // teal
  "#f59e0b", // amber
  "#ec4899", // pink
  "#22c55e", // green
  "#f97316", // orange
];

export function laneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length];
}

const TOOL_COLORS: Record<ToolCategory, string> = {
  terminal: "#0891b2",
  file: "#d97706",
  search: "#65a30d",
  browser: "#2563eb",
  mcp: "#db2777",
  other: "#64748b",
};

const KIND_COLORS: Partial<Record<ThinkingNodeKind, string>> = {
  goal: "#3b6cf6",
  thought: "#8b5cf6",
  plan: "#0ea5e9",
  fork: "#d946ef",
  reply: "#10b981",
  finish: "#f59e0b",
  error: "#ef4444",
};

export function nodeAccent(
  kind: ThinkingNodeKind,
  lane: number,
  toolCategory?: ToolCategory,
): string {
  if (kind === "agent" || kind === "result") return laneColor(lane);
  if ((kind === "tool" || kind === "cluster") && toolCategory) {
    return TOOL_COLORS[toolCategory];
  }
  return KIND_COLORS[kind] ?? laneColor(lane);
}
