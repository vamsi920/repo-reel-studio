import type { ThinkingNodeStatus } from "./thinking-graph-types";

/**
 * Sub-agents run inside the agent-server process and never stream their own
 * events to the parent conversation. The `neo-*` sub-agent definitions
 * (config/harness/agents) carry an async hook that appends every hook event
 * (prompt, each tool call before/after, stop) as one JSON line to
 * `~/.openhands/neodevex/subagent-traces/<UTC date>/<session id>/events.jsonl`.
 * This module turns those lines into the steps drawn inside an agent's lane.
 */
export const SUBAGENT_TRACE_ROOT = ".openhands/neodevex/subagent-traces";
export const SUBAGENT_TRACE_FILE = "events.jsonl";

export interface SubagentStep {
  id: string;
  tool: string;
  label: string;
  status: ThinkingNodeStatus;
}

export interface SubagentTrace {
  sessionId: string;
  /** The task prompt the sub-agent was started with (links it to a Task). */
  prompt: string | null;
  steps: SubagentStep[];
  finished: boolean;
}

interface HookLine {
  event_type?: string;
  tool_name?: string | null;
  tool_input?: Record<string, unknown> | null;
  tool_response?: Record<string, unknown> | null;
  message?: string | null;
}

const LABEL_MAX = 70;
const LABEL_KEYS = ["command", "path", "url", "query", "pattern", "title"];

function inputLabel(input: Record<string, unknown> | null | undefined) {
  if (!input) return "";
  const key = LABEL_KEYS.find((k) => typeof input[k] === "string");
  const raw = key
    ? (input[key] as string)
    : ((Object.values(input).find((v) => typeof v === "string") as
        | string
        | undefined) ?? "");
  const text = raw.replace(/\s+/g, " ").trim();
  return text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX)}…` : text;
}

function responseFailed(response: Record<string, unknown> | null | undefined) {
  if (!response) return false;
  if (response.is_error === true) return true;
  const exit = response.exit_code;
  return typeof exit === "number" && exit > 0;
}

export function parseSubagentTrace(
  sessionId: string,
  text: string,
): SubagentTrace {
  const trace: SubagentTrace = {
    sessionId,
    prompt: null,
    steps: [],
    finished: false,
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    let event: HookLine;
    try {
      event = JSON.parse(line) as HookLine;
    } catch {
      continue; // a partially written line — picked up on the next poll
    }
    switch (event.event_type) {
      case "UserPromptSubmit":
        if (trace.prompt === null) trace.prompt = (event.message ?? "").trim();
        break;
      case "PreToolUse":
        trace.steps.push({
          id: `${sessionId}:${trace.steps.length}`,
          tool: event.tool_name ?? "tool",
          label: inputLabel(event.tool_input),
          status: "running",
        });
        break;
      case "PostToolUse": {
        const step = [...trace.steps]
          .reverse()
          .find((s) => s.status === "running" && s.tool === event.tool_name);
        if (step) {
          step.status = responseFailed(event.tool_response) ? "error" : "done";
        }
        break;
      }
      case "Stop":
        trace.finished = true;
        break;
      default:
        break;
    }
  }
  if (trace.finished) {
    for (const step of trace.steps) {
      if (step.status === "running") step.status = "done";
    }
  }
  return trace;
}

/**
 * Links traces to the Task actions that started them by their exact prompt
 * (the task tool sends the prompt to the sub-agent verbatim). Identical
 * prompts are paired in order.
 */
export function matchTracesToTasks(
  traces: readonly SubagentTrace[],
  tasks: readonly { id: string; prompt: string }[],
): Map<string, SubagentTrace> {
  const matched = new Map<string, SubagentTrace>();
  const used = new Set<string>();
  for (const task of tasks) {
    const prompt = task.prompt.trim();
    const trace = traces.find(
      (t) => !used.has(t.sessionId) && t.prompt === prompt,
    );
    if (trace) {
      used.add(trace.sessionId);
      matched.set(task.id, trace);
    }
  }
  return matched;
}

/** UTC dates (YYYY-MM-DD) a trace for these timestamps may be filed under. */
export function traceDatesFor(timestamps: readonly string[]): string[] {
  const dates = new Set<string>();
  for (const stamp of timestamps) {
    const at = Date.parse(stamp.endsWith("Z") ? stamp : `${stamp}Z`);
    if (Number.isNaN(at)) continue;
    dates.add(new Date(at).toISOString().slice(0, 10));
    // A sub-agent started just before midnight UTC files under the next day.
    dates.add(new Date(at + 6 * 3600_000).toISOString().slice(0, 10));
  }
  return [...dates];
}
