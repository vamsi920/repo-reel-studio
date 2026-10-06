import type { ThinkingNodeKind, ToolCategory } from "./thinking-graph-types";

/** Lane 0 is the main agent; each delegated sub-agent gets the next color. */
const LANE_COLORS = [
  "#4f8cff", // main agent — brand blue
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
  terminal: "#22d3ee",
  file: "#fbbf24",
  search: "#a3e635",
  browser: "#60a5fa",
  mcp: "#f472b6",
  other: "#94a3b8",
};

const KIND_COLORS: Partial<Record<ThinkingNodeKind, string>> = {
  goal: "#6d8bff",
  thought: "#c084fc",
  plan: "#38bdf8",
  fork: "#e879f9",
  reply: "#34d399",
  finish: "#facc15",
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
