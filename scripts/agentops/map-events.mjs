/**
 * agent-server events → AgentOps spans.
 *
 * This is the whole "instrumentation" story for the Control Tower, and it is
 * deliberately a *mapper*, not an instrumentor. NeoDevEx's agent runtime is an
 * external, unmodified OpenHands agent-server that already reports every LLM
 * call's model, token usage, cost and latency (in `ConversationStats`) and
 * every tool call (as `ActionEvent`/`ObservationEvent` pairs). Wrapping it in
 * the AgentOps Python SDK on top of that would instrument each LLM call twice,
 * so instead we translate the runtime's native telemetry into the AgentOps
 * semantic-convention vocabulary vendored at `vendor/agentops/semconv/`.
 *
 * Everything in this module is pure: it takes a run's accumulated state plus
 * new input and returns new spans, audit records and a state patch. All IO
 * (polling, persistence) lives in `collector.mjs` / `store.mjs`, so the mapping
 * rules are testable without a running agent-server.
 *
 * PRIVACY INVARIANT: agent chain-of-thought never leaves this module. The
 * runtime's `ActionEvent` carries `thought`, `reasoning_content` and
 * `thinking_blocks`; none of them are ever copied into a span, an audit record
 * or a run field. `__tests__/scripts/agentops-map-events.test.ts` asserts this.
 */

import {
  AgentAttributes,
  AgentOpsSpanKindValues,
  CoreAttributes,
  SpanAttributes,
  ToolAttributes,
  ToolStatus,
  WorkflowAttributes,
} from "../../vendor/agentops/semconv/index.mjs";

/** Phases the run timeline is grouped into, in their natural order. */
export const RUN_PHASES = [
  "planning",
  "repository_inspection",
  "tool_call",
  "code_edit",
  "tests",
  "review",
  "waiting_approval",
  "completed",
];

/** Human-readable labels; the UI renders these, the ids above are the contract. */
export const RUN_PHASE_LABELS = {
  planning: "Planning",
  repository_inspection: "Repository inspection",
  tool_call: "Tool call",
  code_edit: "Code edit",
  tests: "Tests",
  review: "Review",
  waiting_approval: "Waiting approval",
  completed: "Completed",
};

/** Action kinds that read the repository rather than change it. */
const INSPECTION_ACTION_KINDS = new Set([
  "GlobAction",
  "GrepAction",
  "BrowserGetContentAction",
  "BrowserGetStateAction",
]);

/** Action kinds that write code. */
const EDIT_ACTION_KINDS = new Set([
  "FileEditorAction",
  "StrReplaceEditorAction",
]);

/** Action kinds that are the agent organising itself, not acting. */
const PLANNING_ACTION_KINDS = new Set([
  "ThinkAction",
  "TaskTrackerAction",
  "PlanningFileEditorAction",
]);

/** File-editor commands that only read. */
const READ_ONLY_EDITOR_COMMANDS = new Set(["view"]);

/**
 * Shell command shapes that mean "running the test suite". Matched against the
 * first ~200 chars of the command so a long heredoc can't hide the verb.
 */
const TEST_COMMAND_PATTERN =
  /\b(pytest|jest|vitest|mocha|phpunit|rspec|go\s+test|cargo\s+test|gradle\s+test|mvn\s+test|dotnet\s+test|tox|nox|npm\s+(run\s+)?test|yarn\s+(run\s+)?test|pnpm\s+(run\s+)?test|bun\s+test|make\s+test)\b/i;

/** Shell command shapes that mean "reading the repo". */
const INSPECTION_COMMAND_PATTERN =
  /^\s*(ls|cat|head|tail|find|grep|rg|tree|wc|file|stat|git\s+(status|log|diff|show|branch))\b/i;

/** Shell command shapes that mean "reviewing the work". */
const REVIEW_COMMAND_PATTERN =
  /\b(lint|eslint|ruff|flake8|mypy|tsc|typecheck|prettier|black|gofmt|clippy)\b/i;

/** agent-server execution_status → run status. Unknown values fall back to idle. */
const RUN_STATUSES = new Set([
  "idle",
  "running",
  "paused",
  "waiting_for_confirmation",
  "finished",
  "error",
  "stuck",
]);

export function normalizeRunStatus(executionStatus) {
  return RUN_STATUSES.has(executionStatus) ? executionStatus : "idle";
}

/** An ISO-8601 string that already carries a zone: trailing "Z" or ±HH[:MM]. */
const ZONED_ISO_PATTERN = /(Z|[+-]\d{2}(:?\d{2})?)$/i;

/**
 * Make a runtime timestamp unambiguous.
 *
 * The agent-server serialises its datetimes naively — "2026-09-14T01:53:30.400286",
 * no "Z", no offset — while the collector's own records use
 * `new Date().toISOString()`. Both are UTC, but a browser's `new Date()`
 * parses an offset-less ISO string as *local* time, so a tool call and the
 * "run completed" row that followed it two seconds later rendered hours apart
 * and sorted out of order. Every timestamp copied out of a runtime event or
 * conversation record goes through here so the store only ever holds zoned
 * UTC. Anything that isn't an offset-less ISO string is returned untouched.
 */
export function normalizeTimestamp(value) {
  if (typeof value !== "string") return value;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return value;
  if (ZONED_ISO_PATTERN.test(value)) return value;
  return `${value}Z`;
}

/**
 * Terminal statuses — a run in one of these is history, not a live run.
 *
 * "stuck" is terminal on purpose: the runtime's loop detector has halted the
 * agent, and the SDK treats STUCK exactly like FINISHED — only a new user
 * message resets it (`LocalConversation.send_message`). `/interrupt` is a
 * no-op on it and `/run` re-trips the detector within milliseconds, so there
 * is nothing live left to pause, stop, or resume.
 */
export function isTerminalStatus(status) {
  return status === "finished" || status === "error" || status === "stuck";
}

/** Live statuses — what the "Active Agents" tile counts. */
export function isActiveStatus(status) {
  return (
    status === "running" ||
    status === "paused" ||
    status === "waiting_for_confirmation"
  );
}

function first200(value) {
  return typeof value === "string" ? value.slice(0, 200) : "";
}

/**
 * Derive the run phase an action belongs to. Deliberately conservative: a tool
 * call we can't classify is a plain "tool_call", never a guess at something
 * more specific.
 */
export function phaseForAction(action) {
  const kind = action?.kind;
  if (!kind) return "tool_call";

  if (kind === "FinishAction") return "completed";
  if (PLANNING_ACTION_KINDS.has(kind)) return "planning";
  if (INSPECTION_ACTION_KINDS.has(kind)) return "repository_inspection";

  if (EDIT_ACTION_KINDS.has(kind)) {
    return READ_ONLY_EDITOR_COMMANDS.has(action.command)
      ? "repository_inspection"
      : "code_edit";
  }

  if (kind === "ExecuteBashAction" || kind === "TerminalAction") {
    const command = first200(action.command);
    if (TEST_COMMAND_PATTERN.test(command)) return "tests";
    if (REVIEW_COMMAND_PATTERN.test(command)) return "review";
    if (INSPECTION_COMMAND_PATTERN.test(command))
      return "repository_inspection";
    return "tool_call";
  }

  return "tool_call";
}

/**
 * The subset of an action's arguments that is safe and useful to persist.
 *
 * Approvals need to show *what the agent wants to do*, so tool parameters are
 * kept — but bounded, because a `create` file edit carries an entire file and
 * the store is append-only JSONL. Chain-of-thought fields are not in `action`
 * and are never read from the event.
 */
export function summarizeActionParameters(action, maxChars = 2000) {
  if (!action || typeof action !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(action)) {
    if (key === "kind") continue;
    if (value === null || value === undefined) continue;
    if (typeof value === "string") {
      out[key] =
        value.length > maxChars
          ? `${value.slice(0, maxChars)}… [truncated ${value.length - maxChars} chars]`
          : value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else {
      const serialized = JSON.stringify(value);
      out[key] =
        serialized && serialized.length > maxChars
          ? `${serialized.slice(0, maxChars)}… [truncated]`
          : serialized;
    }
  }
  return out;
}

/** Bounded text form of an observation, for the span's tool.result attribute. */
export function summarizeObservation(observation, maxChars = 2000) {
  if (!observation || typeof observation !== "object") return "";
  const candidate =
    typeof observation.output === "string"
      ? observation.output
      : typeof observation.text === "string"
        ? observation.text
        : typeof observation.content === "string"
          ? observation.content
          : JSON.stringify(observation);
  if (typeof candidate !== "string") return "";
  return candidate.length > maxChars
    ? `${candidate.slice(0, maxChars)}… [truncated ${candidate.length - maxChars} chars]`
    : candidate;
}

/** Paths an edit action touched — the run's "artifacts". */
export function artifactsForAction(action) {
  if (!action) return [];
  if (!EDIT_ACTION_KINDS.has(action.kind)) return [];
  if (READ_ONLY_EDITOR_COMMANDS.has(action.command)) return [];
  return typeof action.path === "string" ? [action.path] : [];
}

function isActionEvent(event) {
  return (
    event?.source === "agent" &&
    event.action &&
    typeof event.action === "object" &&
    typeof event.tool_name === "string" &&
    typeof event.tool_call_id === "string"
  );
}

function isObservationEvent(event) {
  return (
    event?.source === "environment" &&
    "action_id" in (event ?? {}) &&
    event.observation &&
    typeof event.observation === "object"
  );
}

function isUserRejectObservation(event) {
  return (
    event?.source === "environment" &&
    typeof event.rejection_reason === "string" &&
    typeof event.tool_call_id === "string"
  );
}

function isAgentErrorEvent(event) {
  return (
    event?.source === "agent" &&
    typeof event.error === "string" &&
    typeof event.tool_call_id === "string"
  );
}

/**
 * The synthetic error the runtime backfills for a tool call that was in
 * flight when the conversation was interrupted (`LocalConversation.
 * _emit_orphaned_action_errors`). Pause, Stop and a budget halt all go
 * through `/interrupt`, so this lands on every run an operator paused — it
 * is bookkeeping for the LLM history, not something the agent got wrong.
 */
const INTERRUPTED_TOOL_CALL_PATTERN =
  /interrupted before completion|conversation was paused/i;

/** A tool span cut short by an interrupt: neither succeeded nor failed. */
export const TOOL_STATUS_INTERRUPTED = "interrupted";

export function isInterruptedToolCallError(message) {
  return (
    typeof message === "string" && INTERRUPTED_TOOL_CALL_PATTERN.test(message)
  );
}

function isUserMessageEvent(event) {
  return event?.llm_message?.role === "user";
}

/** Deterministic span ids, so replaying the same events is idempotent. */
function spanId(runId, suffix) {
  return `${runId}:${suffix}`;
}

/**
 * Accumulates one conversation's telemetry.
 *
 * Fed by `collector.mjs`: `applyEvent` for each new event in id order, and
 * `applyStats` whenever fresh `ConversationStats` are polled. Both return
 * `{ spans, audit }` for the caller to persist; the aggregator itself holds
 * only what later mapping decisions need.
 */
export class RunAggregator {
  constructor(run, { taskStarted = false } = {}) {
    this.run = run;
    /** tool_call_id → open tool span, awaiting its observation. */
    this.openToolSpans = new Map();
    /** usage id → count of token_usages entries already turned into spans. */
    this.llmCursor = new Map();
    /**
     * Event ids already folded in. The agent-server's events/search pages are
     * not strictly ordered by timestamp, so the collector's cursor can hand
     * the same event back; counting it twice inflated toolCallCount and
     * duplicated tool.called audit rows.
     */
    this.seenEventIds = new Set();
    /**
     * Whether the run's opening user message has been folded in. Tracked
     * explicitly: `run.startedAt` cannot stand in for it, because createRun
     * seeds it from the conversation's created_at before any event arrives.
     * The collector sets it for a run reloaded from the store whose opening
     * message was already tailed before a restart.
     */
    this.taskStarted = taskStarted;
  }

  /** The run's current derived phase. */
  get phase() {
    return this.run.phase;
  }

  /**
   * Move the run to an event-derived phase — unless the run is already over.
   *
   * A terminal status owns the phase: `applyStatus("finished")` sets
   * "completed", and the events tailed afterwards (the last tool call and its
   * completion often land in the same poll tick, or get re-tailed later) must
   * not drag a finished run back to "tool_call" / "planning".
   */
  #setPhase(phase) {
    if (isTerminalStatus(this.run.status)) return;
    this.run.phase = phase;
  }

  applyEvent(event) {
    if (!event || typeof event.id !== "string") return { spans: [], audit: [] };
    if (this.seenEventIds.has(event.id)) return { spans: [], audit: [] };
    this.seenEventIds.add(event.id);

    if (isActionEvent(event)) return this.#applyAction(event);
    if (isUserRejectObservation(event)) return this.#applyRejection(event);
    if (isObservationEvent(event)) return this.#applyObservation(event);
    if (isAgentErrorEvent(event)) return this.#applyAgentError(event);
    if (isUserMessageEvent(event)) return this.#applyUserMessage(event);

    return { spans: [], audit: [] };
  }

  #applyUserMessage(event) {
    // The first user message is the task. Later ones are follow-up turns; both
    // are worth an audit line, neither is worth a span.
    const isFirst = !this.taskStarted;
    if (isFirst) {
      this.taskStarted = true;
      // createRun normally seeds startedAt from the conversation metadata;
      // the message timestamp is only a fallback when that was missing.
      this.run.startedAt ??= normalizeTimestamp(event.timestamp);
      this.#setPhase("planning");
    }
    return {
      spans: [],
      audit: [
        {
          action: isFirst ? "task.started" : "task.message",
          summary: isFirst
            ? `Run started in ${this.run.workspaceId}`
            : "User sent a follow-up message",
          at: normalizeTimestamp(event.timestamp),
          actor: "user",
        },
      ],
    };
  }

  #applyAction(event) {
    const phase = phaseForAction(event.action);
    const parameters = summarizeActionParameters(event.action);
    const span = {
      spanId: spanId(this.run.runId, event.id),
      parentSpanId: null,
      traceId: this.run.runId,
      kind: AgentOpsSpanKindValues.TOOL,
      name: event.tool_name,
      phase,
      startTime: normalizeTimestamp(event.timestamp),
      endTime: null,
      status: ToolStatus.EXECUTING,
      attributes: {
        [ToolAttributes.TOOL_NAME]: event.tool_name,
        [ToolAttributes.TOOL_ID]: event.tool_call_id,
        [ToolAttributes.TOOL_PARAMETERS]: parameters,
        [ToolAttributes.TOOL_STATUS]: ToolStatus.EXECUTING,
        [SpanAttributes.AGENTOPS_SPAN_KIND]: AgentOpsSpanKindValues.TOOL,
        [SpanAttributes.LLM_RESPONSE_ID]: event.llm_response_id ?? null,
        [AgentAttributes.AGENT_NAME]: this.run.agentName,
        [WorkflowAttributes.WORKFLOW_RUN_ID]: this.run.runId,
        [WorkflowAttributes.WORKFLOW_STEP_TYPE]: phase,
        "agentops.action.kind": event.action?.kind ?? null,
        "neodevex.security_risk": event.security_risk ?? null,
        // `summary` is a label the agent chose to expose for this tool call.
        // `thought` / `reasoning_content` / `thinking_blocks` are NOT read.
        "neodevex.action.summary": event.summary ?? null,
      },
    };

    this.openToolSpans.set(event.tool_call_id, span);
    this.run.toolCallCount += 1;
    this.#setPhase(phase);

    const artifacts = artifactsForAction(event.action);
    for (const artifact of artifacts) {
      if (!this.run.artifacts.includes(artifact))
        this.run.artifacts.push(artifact);
    }

    return {
      spans: [span],
      audit: [
        {
          action: "tool.called",
          summary: `${event.tool_name} (${event.action?.kind ?? "unknown"})`,
          at: normalizeTimestamp(event.timestamp),
          actor: "agent",
          metadata: {
            toolCallId: event.tool_call_id,
            phase,
            securityRisk: event.security_risk ?? null,
            artifacts,
          },
        },
      ],
    };
  }

  #closeToolSpan(toolCallId, { status, endTime, result, errorMessage }) {
    const open = this.openToolSpans.get(toolCallId);
    if (!open) return null;
    this.openToolSpans.delete(toolCallId);
    const closed = {
      ...open,
      endTime,
      status,
      attributes: {
        ...open.attributes,
        [ToolAttributes.TOOL_STATUS]: status,
        ...(result === undefined
          ? {}
          : { [ToolAttributes.TOOL_RESULT]: result }),
        ...(errorMessage
          ? {
              [CoreAttributes.ERROR_MESSAGE]: errorMessage,
              [CoreAttributes.ERROR_TYPE]:
                status === TOOL_STATUS_INTERRUPTED
                  ? "tool_interrupted"
                  : "tool_error",
            }
          : {}),
      },
    };
    return closed;
  }

  #applyObservation(event) {
    const isError = event.observation?.is_error === true;
    const closed = this.#closeToolSpan(event.tool_call_id, {
      status: isError ? ToolStatus.FAILED : ToolStatus.SUCCEEDED,
      endTime: normalizeTimestamp(event.timestamp),
      result: summarizeObservation(event.observation),
      errorMessage: isError
        ? summarizeObservation(event.observation, 500)
        : null,
    });
    if (!closed) return { spans: [], audit: [] };
    if (isError) this.run.errorCount += 1;
    return { spans: [closed], audit: [] };
  }

  #applyRejection(event) {
    const closed = this.#closeToolSpan(event.tool_call_id, {
      status: ToolStatus.FAILED,
      endTime: normalizeTimestamp(event.timestamp),
      result: null,
      errorMessage: `Rejected: ${event.rejection_reason}`,
    });
    return {
      spans: closed ? [closed] : [],
      audit: [
        {
          action: "approval.rejected",
          summary: `Action rejected: ${event.rejection_reason}`,
          at: normalizeTimestamp(event.timestamp),
          actor: "user",
          metadata: { toolCallId: event.tool_call_id },
        },
      ],
    };
  }

  #applyAgentError(event) {
    if (isInterruptedToolCallError(event.error)) {
      return this.#applyInterruptedToolCall(event);
    }
    this.run.errorCount += 1;
    const closed = this.#closeToolSpan(event.tool_call_id, {
      status: ToolStatus.FAILED,
      endTime: normalizeTimestamp(event.timestamp),
      result: null,
      errorMessage: first200(event.error),
    });
    return {
      spans: closed ? [closed] : [],
      audit: [
        {
          action: "task.error",
          summary: first200(event.error),
          at: normalizeTimestamp(event.timestamp),
          actor: "agent",
        },
      ],
    };
  }

  /**
   * An interrupt cut a tool call short. The span is closed as "interrupted"
   * rather than failed and `errorCount` is left alone: `policy.summarize`
   * counts any finished run with an error as a failure, and a run the
   * operator paused and then let finish did not fail. The audit row is
   * attributed to the system, since the agent did nothing here.
   */
  #applyInterruptedToolCall(event) {
    const closed = this.#closeToolSpan(event.tool_call_id, {
      status: TOOL_STATUS_INTERRUPTED,
      endTime: normalizeTimestamp(event.timestamp),
      result: null,
      errorMessage: first200(event.error),
    });
    return {
      spans: closed ? [closed] : [],
      audit: [
        {
          action: "tool.interrupted",
          summary: `Tool call interrupted: ${closed?.name ?? event.tool_name ?? "tool"}`,
          at: normalizeTimestamp(event.timestamp),
          actor: "system",
          metadata: { toolCallId: event.tool_call_id },
        },
      ],
    };
  }

  /**
   * Turn newly-appended `ConversationStats` entries into LLM spans and refresh
   * the run's cost/token totals.
   *
   * `token_usages`, `costs` and `response_latencies` are parallel append-only
   * arrays inside each usage id: the runtime appends one entry to each per
   * completion. `token_usages` and `response_latencies` carry a `response_id`
   * and are joined on it; `costs` carries only `{model, cost, timestamp}`, so
   * it is joined **positionally** with `token_usages`. If a future runtime
   * appends to them at different rates the cost simply goes unattached for
   * that call — the run total still comes from `accumulated_cost`, which is
   * authoritative and never estimated here.
   */
  applyStats(stats, observedAt) {
    const usageToMetrics = stats?.usage_to_metrics;
    if (!usageToMetrics || typeof usageToMetrics !== "object") {
      return { spans: [], audit: [] };
    }

    const spans = [];
    let accumulatedCost = 0;
    let maxBudgetPerTask = null;
    let llmCallCount = 0;
    const totals = {
      prompt: 0,
      completion: 0,
      cacheRead: 0,
      cacheWrite: 0,
      reasoning: 0,
    };
    let latestModel = this.run.model;

    for (const [usageId, metrics] of Object.entries(usageToMetrics)) {
      if (!metrics || typeof metrics !== "object") continue;

      if (typeof metrics.accumulated_cost === "number") {
        accumulatedCost += metrics.accumulated_cost;
      }
      if (typeof metrics.max_budget_per_task === "number") {
        maxBudgetPerTask =
          maxBudgetPerTask === null
            ? metrics.max_budget_per_task
            : Math.min(maxBudgetPerTask, metrics.max_budget_per_task);
      }

      const usages = Array.isArray(metrics.token_usages)
        ? metrics.token_usages
        : [];
      const costs = Array.isArray(metrics.costs) ? metrics.costs : [];
      const latencies = Array.isArray(metrics.response_latencies)
        ? metrics.response_latencies
        : [];
      const latencyByResponseId = new Map(
        latencies
          .filter((entry) => entry && typeof entry.response_id === "string")
          .map((entry) => [entry.response_id, entry.latency]),
      );

      for (const usage of usages) {
        if (!usage || typeof usage !== "object") continue;
        llmCallCount += 1;
        totals.prompt += usage.prompt_tokens ?? 0;
        totals.completion += usage.completion_tokens ?? 0;
        totals.cacheRead += usage.cache_read_tokens ?? 0;
        totals.cacheWrite += usage.cache_write_tokens ?? 0;
        totals.reasoning += usage.reasoning_tokens ?? 0;
      }

      // Only the *newly appended* entries become spans; earlier polls already
      // emitted the rest.
      const seen = this.llmCursor.get(usageId) ?? 0;
      for (let index = seen; index < usages.length; index += 1) {
        const usage = usages[index];
        if (!usage || typeof usage !== "object") continue;
        const model = usage.model ?? metrics.model_name ?? null;
        if (model) latestModel = model;
        const cost = costs[index]?.cost ?? null;
        const latencySeconds =
          latencyByResponseId.get(usage.response_id) ?? null;
        const startTime =
          typeof costs[index]?.timestamp === "number"
            ? new Date(costs[index].timestamp * 1000).toISOString()
            : observedAt;

        spans.push({
          spanId: spanId(this.run.runId, `llm:${usageId}:${index}`),
          parentSpanId: null,
          traceId: this.run.runId,
          kind: AgentOpsSpanKindValues.LLM,
          name: model ? `LLM ${model}` : "LLM call",
          phase: this.run.phase,
          startTime,
          endTime:
            latencySeconds === null
              ? startTime
              : new Date(
                  new Date(startTime).getTime() + latencySeconds * 1000,
                ).toISOString(),
          status: "succeeded",
          attributes: {
            [SpanAttributes.AGENTOPS_SPAN_KIND]: AgentOpsSpanKindValues.LLM,
            [SpanAttributes.LLM_RESPONSE_MODEL]: model,
            [SpanAttributes.LLM_REQUEST_MODEL]: model,
            [SpanAttributes.LLM_RESPONSE_ID]: usage.response_id ?? null,
            [SpanAttributes.LLM_USAGE_PROMPT_TOKENS]: usage.prompt_tokens ?? 0,
            [SpanAttributes.LLM_USAGE_COMPLETION_TOKENS]:
              usage.completion_tokens ?? 0,
            [SpanAttributes.LLM_USAGE_TOTAL_TOKENS]:
              (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
            [SpanAttributes.LLM_USAGE_CACHE_READ_INPUT_TOKENS]:
              usage.cache_read_tokens ?? 0,
            [SpanAttributes.LLM_USAGE_CACHE_CREATION_INPUT_TOKENS]:
              usage.cache_write_tokens ?? 0,
            [SpanAttributes.LLM_USAGE_REASONING_TOKENS]:
              usage.reasoning_tokens ?? 0,
            // Null, not 0, when the runtime gave us no cost for this call —
            // a missing cost must never render as "free".
            [SpanAttributes.LLM_USAGE_TOOL_COST]: cost,
            [SpanAttributes.LLM_STREAMING_TIME_TO_GENERATE]: latencySeconds,
            [WorkflowAttributes.WORKFLOW_RUN_ID]: this.run.runId,
            "agentops.usage.id": usageId,
          },
        });
      }
      this.llmCursor.set(usageId, usages.length);
    }

    // Recomputed from the runtime's totals, like tokens and cost, rather than
    // incremented: an aggregator rebuilt from the store (collector restart,
    // or a finished run re-polled) starts with an empty llmCursor and would
    // otherwise add every call again on each poll.
    this.run.llmCallCount = llmCallCount;
    this.run.costUsd = accumulatedCost;
    this.run.maxBudgetPerTask = maxBudgetPerTask;
    this.run.model = latestModel;
    this.run.tokens = {
      prompt: totals.prompt,
      completion: totals.completion,
      cacheRead: totals.cacheRead,
      cacheWrite: totals.cacheWrite,
      reasoning: totals.reasoning,
      total: totals.prompt + totals.completion,
    };

    return { spans, audit: [] };
  }

  /** Fold a status change in, emitting the audit records it implies. */
  applyStatus(nextStatus, observedAt) {
    const previous = this.run.status;
    const status = normalizeRunStatus(nextStatus);
    if (status === previous) return { spans: [], audit: [] };

    this.run.status = status;
    this.run.updatedAt = observedAt;

    if (status === "waiting_for_confirmation")
      this.run.phase = "waiting_approval";
    if (status === "finished") this.run.phase = "completed";

    if (isTerminalStatus(status)) this.run.endedAt = observedAt;
    else this.run.endedAt = null;

    const audit = [];
    if (status === "finished") {
      audit.push({
        action: "task.completed",
        summary: `Run completed after ${this.run.toolCallCount} tool calls`,
        at: observedAt,
        actor: "agent",
      });
    } else if (status === "error") {
      audit.push({
        action: "task.failed",
        summary: "Run ended in an error state",
        at: observedAt,
        actor: "agent",
      });
    } else if (status === "stuck") {
      audit.push({
        action: "task.stuck",
        summary:
          "Runtime halted the run: the agent was repeating itself (stuck detection)",
        at: observedAt,
        actor: "agent",
      });
    } else if (status === "paused") {
      audit.push({
        action: "run.paused",
        summary: "Run paused",
        at: observedAt,
        actor: "system",
      });
    } else if (previous === "paused" && status === "running") {
      audit.push({
        action: "run.resumed",
        summary: "Run resumed",
        at: observedAt,
        actor: "system",
      });
    } else if (status === "waiting_for_confirmation") {
      audit.push({
        action: "approval.requested",
        summary: "Agent is waiting for confirmation",
        at: observedAt,
        actor: "agent",
      });
    }

    return { spans: [], audit };
  }
}

/**
 * The phase a run should start in given its first-observed status. Mirrors
 * the transitions RunAggregator.applyStatus() would apply — needed because
 * applyStatus() only fires on a status *change*, so a run whose very first
 * observation is already terminal (e.g. the collector missed the earlier
 * ticks) would otherwise never leave the default "planning" phase.
 */
function initialPhaseForStatus(status) {
  if (status === "finished") return "completed";
  if (status === "waiting_for_confirmation") return "waiting_approval";
  return "planning";
}

/** A fresh run record for a conversation the collector has not seen before. */
export function createRun(conversation, observedAt) {
  const status = normalizeRunStatus(conversation.executionStatus);
  return {
    runId: conversation.id,
    workspaceId: conversation.workspaceId ?? "unknown",
    agentName: conversation.agentName ?? "agent",
    task: conversation.title ?? "Untitled run",
    status,
    model: conversation.model ?? null,
    phase: initialPhaseForStatus(status),
    startedAt: normalizeTimestamp(conversation.createdAt) ?? observedAt,
    endedAt: null,
    updatedAt: observedAt,
    costUsd: 0,
    maxBudgetPerTask: null,
    tokens: {
      prompt: 0,
      completion: 0,
      cacheRead: 0,
      cacheWrite: 0,
      reasoning: 0,
      total: 0,
    },
    toolCallCount: 0,
    llmCallCount: 0,
    errorCount: 0,
    artifacts: [],
    lastEventId: null,
  };
}
