import { describe, expect, it } from "vitest";

import {
  RunAggregator,
  createRun,
  phaseForAction,
  summarizeActionParameters,
  isActiveStatus,
  isInterruptedToolCallError,
  isTerminalStatus,
  normalizeTimestamp,
} from "../../scripts/agentops/map-events.mjs";
import { summarize } from "../../scripts/agentops/policy.mjs";

const OBSERVED_AT = "2026-01-02T00:00:00.000Z";

function newRun() {
  return createRun(
    {
      id: "run-1",
      workspaceId: "/workspace/project",
      agentName: "OpenHands Agent",
      title: "Fix the flaky test",
      executionStatus: "running",
      model: "claude-opus-5",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    OBSERVED_AT,
  );
}

function actionEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-1",
    timestamp: "2026-01-01T00:00:01.000Z",
    source: "agent",
    tool_name: "execute_bash",
    tool_call_id: "call-1",
    llm_response_id: "resp-1",
    security_risk: "LOW",
    action: { kind: "ExecuteBashAction", command: "pytest -q" },
    ...overrides,
  };
}

describe("phaseForAction", () => {
  it("classifies planning, inspection, edit, test and review work", () => {
    expect(phaseForAction({ kind: "ThinkAction" })).toBe("planning");
    expect(phaseForAction({ kind: "TaskTrackerAction" })).toBe("planning");
    expect(phaseForAction({ kind: "GrepAction" })).toBe(
      "repository_inspection",
    );
    expect(phaseForAction({ kind: "FileEditorAction", command: "view" })).toBe(
      "repository_inspection",
    );
    expect(
      phaseForAction({ kind: "FileEditorAction", command: "str_replace" }),
    ).toBe("code_edit");
    expect(
      phaseForAction({ kind: "ExecuteBashAction", command: "npm test -- foo" }),
    ).toBe("tests");
    expect(
      phaseForAction({
        kind: "ExecuteBashAction",
        command: "npx tsc --noEmit",
      }),
    ).toBe("review");
    expect(
      phaseForAction({ kind: "ExecuteBashAction", command: "git status" }),
    ).toBe("repository_inspection");
    expect(phaseForAction({ kind: "FinishAction" })).toBe("completed");
  });

  it("falls back to a plain tool call rather than guessing", () => {
    expect(phaseForAction({ kind: "SomeFutureAction" })).toBe("tool_call");
    expect(
      phaseForAction({ kind: "ExecuteBashAction", command: "./deploy.sh" }),
    ).toBe("tool_call");
    expect(phaseForAction(undefined)).toBe("tool_call");
  });
});

describe("normalizeTimestamp", () => {
  it("marks the agent-server's offset-less ISO timestamps as UTC", () => {
    expect(normalizeTimestamp("2026-09-14T01:53:30.400286")).toBe(
      "2026-09-14T01:53:30.400286Z",
    );
    expect(normalizeTimestamp("2026-09-14T01:53:30")).toBe(
      "2026-09-14T01:53:30Z",
    );
  });

  it("leaves already-zoned timestamps and non-ISO values alone", () => {
    expect(normalizeTimestamp("2026-09-14T01:53:49.794Z")).toBe(
      "2026-09-14T01:53:49.794Z",
    );
    expect(normalizeTimestamp("2026-09-14T01:53:49+00:00")).toBe(
      "2026-09-14T01:53:49+00:00",
    );
    expect(normalizeTimestamp("2026-09-13T21:53:49-0400")).toBe(
      "2026-09-13T21:53:49-0400",
    );
    expect(normalizeTimestamp("not a date")).toBe("not a date");
    expect(normalizeTimestamp(null)).toBeNull();
    expect(normalizeTimestamp(undefined)).toBeUndefined();
  });
});

describe("RunAggregator — timestamps", () => {
  // Regression: the runtime emits naive timestamps ("…T01:53:30.400286", no
  // "Z"); copied through verbatim they were parsed by the browser as local
  // time and rendered hours off next to the collector's own zoned records.
  it("stores every event-derived timestamp as zoned UTC", () => {
    const aggregator = new RunAggregator(newRun());

    const started = aggregator.applyEvent({
      id: "evt-0",
      timestamp: "2026-09-14T01:52:55.122847",
      source: "user",
      llm_message: { role: "user", content: "hi" },
    });
    expect(started.audit[0].at).toBe("2026-09-14T01:52:55.122847Z");

    const opened = aggregator.applyEvent(
      actionEvent({ timestamp: "2026-09-14T01:53:30.400286" }),
    );
    expect(opened.spans[0].startTime).toBe("2026-09-14T01:53:30.400286Z");
    expect(opened.audit[0].at).toBe("2026-09-14T01:53:30.400286Z");

    const closed = aggregator.applyEvent({
      id: "evt-2",
      timestamp: "2026-09-14T01:53:31.000000",
      source: "environment",
      action_id: "evt-1",
      tool_name: "execute_bash",
      tool_call_id: "call-1",
      observation: { kind: "ExecuteBashObservation", output: "ok" },
    });
    expect(closed.spans[0].endTime).toBe("2026-09-14T01:53:31.000000Z");
  });

  it("uses the first user message's (normalized) timestamp as startedAt", () => {
    const run = createRun(
      {
        id: "run-2",
        executionStatus: "running",
        createdAt: "2026-09-14T01:52:55.122847",
      },
      OBSERVED_AT,
    );
    expect(run.startedAt).toBe("2026-09-14T01:52:55.122847Z");

    run.startedAt = null;
    const aggregator = new RunAggregator(run);
    aggregator.applyEvent({
      id: "evt-0",
      timestamp: "2026-09-14T01:53:00.000000",
      source: "user",
      llm_message: { role: "user", content: "hi" },
    });
    expect(aggregator.run.startedAt).toBe("2026-09-14T01:53:00.000000Z");
  });
});

describe("RunAggregator — user messages", () => {
  function userMessage(id: string, timestamp: string, content: string) {
    return {
      id,
      timestamp,
      source: "user",
      llm_message: { role: "user", content },
    };
  }

  it("audits the first user message as task.started even though startedAt is pre-seeded", () => {
    // createRun seeds startedAt from the conversation's created_at before any
    // event is tailed, so "first message" cannot be inferred from it — every
    // run's opening message used to be logged as a follow-up.
    const run = newRun();
    expect(run.startedAt).toBe("2026-01-01T00:00:00.000Z");
    const aggregator = new RunAggregator(run);

    const first = aggregator.applyEvent(
      userMessage("evt-user-1", "2026-01-01T00:00:01.000Z", "Fix the test"),
    );
    expect(first.audit).toEqual([
      {
        action: "task.started",
        summary: "Run started in /workspace/project",
        at: "2026-01-01T00:00:01.000Z",
        actor: "user",
      },
    ]);
    // The conversation's own created_at stays the run's start time.
    expect(aggregator.run.startedAt).toBe("2026-01-01T00:00:00.000Z");

    const second = aggregator.applyEvent(
      userMessage("evt-user-2", "2026-01-01T00:05:00.000Z", "Also lint"),
    );
    expect(second.audit).toEqual([
      expect.objectContaining({
        action: "task.message",
        summary: "User sent a follow-up message",
        actor: "user",
      }),
    ]);
  });

  it("treats the next message as a follow-up when told the task already started", () => {
    // A collector restarted mid-run rebuilds the aggregator from the store;
    // the opening message was tailed before the restart and must not be
    // re-announced as task.started when the user sends another one.
    const aggregator = new RunAggregator(newRun(), { taskStarted: true });

    const result = aggregator.applyEvent(
      userMessage("evt-user-2", "2026-01-01T00:05:00.000Z", "Also lint"),
    );
    expect(result.audit).toEqual([
      expect.objectContaining({ action: "task.message" }),
    ]);
  });
});

describe("RunAggregator — event dedupe", () => {
  it("ignores an event it has already folded in", () => {
    // The agent-server's events/search pages are not strictly ordered by
    // timestamp, so the collector can hand the same ActionEvent back; it must
    // not count as a second tool call or a second tool.called audit row.
    const aggregator = new RunAggregator(newRun());
    const first = aggregator.applyEvent(actionEvent());
    expect(first.spans).toHaveLength(1);
    expect(first.audit).toHaveLength(1);

    const again = aggregator.applyEvent(actionEvent());
    expect(again).toEqual({ spans: [], audit: [] });
    expect(aggregator.run.toolCallCount).toBe(1);
  });
});

describe("RunAggregator — tool spans", () => {
  it("opens a tool span on the action and closes it on the observation", () => {
    const aggregator = new RunAggregator(newRun());

    const opened = aggregator.applyEvent(actionEvent());
    expect(opened.spans).toHaveLength(1);
    expect(opened.spans[0]).toMatchObject({
      spanId: "run-1:evt-1",
      traceId: "run-1",
      kind: "tool",
      name: "execute_bash",
      phase: "tests",
      status: "executing",
      endTime: null,
    });
    expect(opened.audit[0]).toMatchObject({ action: "tool.called" });

    const closed = aggregator.applyEvent({
      id: "evt-2",
      timestamp: "2026-01-01T00:00:05.000Z",
      source: "environment",
      action_id: "evt-1",
      tool_name: "execute_bash",
      tool_call_id: "call-1",
      observation: { kind: "ExecuteBashObservation", output: "1 passed" },
    });
    expect(closed.spans).toHaveLength(1);
    expect(closed.spans[0]).toMatchObject({
      spanId: "run-1:evt-1",
      status: "succeeded",
      endTime: "2026-01-01T00:00:05.000Z",
    });
    expect(closed.spans[0].attributes["tool.result"]).toBe("1 passed");
  });

  it("records an error observation as a failed span and counts it", () => {
    const aggregator = new RunAggregator(newRun());
    aggregator.applyEvent(actionEvent());
    const closed = aggregator.applyEvent({
      id: "evt-2",
      timestamp: "2026-01-01T00:00:05.000Z",
      source: "environment",
      action_id: "evt-1",
      tool_name: "execute_bash",
      tool_call_id: "call-1",
      observation: {
        kind: "ExecuteBashObservation",
        output: "boom",
        is_error: true,
      },
    });
    expect(closed.spans[0].status).toBe("failed");
    expect(closed.spans[0].attributes["error.message"]).toBe("boom");
    expect(aggregator.run.errorCount).toBe(1);
  });

  it("records a real agent error as a failed span and counts it", () => {
    const aggregator = new RunAggregator(newRun());
    aggregator.applyEvent(actionEvent());
    const errored = aggregator.applyEvent({
      id: "evt-3",
      timestamp: "2026-01-01T00:00:06.000Z",
      source: "agent",
      tool_name: "execute_bash",
      tool_call_id: "call-1",
      error: "Tool execute_bash raised: command not found",
    });
    expect(errored.spans[0].status).toBe("failed");
    expect(errored.audit[0]).toMatchObject({
      action: "task.error",
      actor: "agent",
    });
    expect(aggregator.run.errorCount).toBe(1);
  });

  it("does not count the runtime's interrupt backfill as an error", () => {
    // Pause, Stop and a budget halt all call /interrupt; the SDK then emits
    // this synthetic AgentErrorEvent for the tool call that was in flight.
    const aggregator = new RunAggregator(newRun());
    aggregator.applyEvent(actionEvent());
    const interrupted = aggregator.applyEvent({
      id: "evt-3",
      timestamp: "2026-01-01T00:00:06.000Z",
      source: "agent",
      tool_name: "execute_bash",
      tool_call_id: "call-1",
      error:
        "Tool call interrupted before completion. The conversation was paused.",
    });
    expect(interrupted.spans).toHaveLength(1);
    expect(interrupted.spans[0]).toMatchObject({
      spanId: "run-1:evt-1",
      status: "interrupted",
      endTime: "2026-01-01T00:00:06.000Z",
    });
    expect(interrupted.spans[0].attributes["error.type"]).toBe(
      "tool_interrupted",
    );
    expect(interrupted.audit).toHaveLength(1);
    expect(interrupted.audit[0]).toMatchObject({
      action: "tool.interrupted",
      actor: "system",
      summary: "Tool call interrupted: execute_bash",
    });
    expect(interrupted.audit[0].action).not.toBe("task.error");
    expect(aggregator.run.errorCount).toBe(0);
    expect(aggregator.openToolSpans.size).toBe(0);
  });

  it("recognises the interrupt message and nothing else", () => {
    expect(
      isInterruptedToolCallError(
        "Tool call interrupted before completion. The conversation was paused.",
      ),
    ).toBe(true);
    expect(isInterruptedToolCallError("Tool raised: not found")).toBe(false);
    expect(isInterruptedToolCallError(undefined)).toBe(false);
  });

  it("records a user rejection as an audit event and a failed span", () => {
    const aggregator = new RunAggregator(newRun());
    aggregator.applyEvent(actionEvent());
    const rejected = aggregator.applyEvent({
      id: "evt-3",
      timestamp: "2026-01-01T00:00:06.000Z",
      source: "environment",
      tool_call_id: "call-1",
      action_id: "evt-1",
      rejection_reason: "Not allowed to touch prod",
    });
    expect(rejected.spans[0].status).toBe("failed");
    expect(rejected.audit[0]).toMatchObject({ action: "approval.rejected" });
  });

  it("collects edited paths as run artifacts, but not viewed ones", () => {
    const aggregator = new RunAggregator(newRun());
    aggregator.applyEvent(
      actionEvent({
        id: "edit-1",
        tool_call_id: "call-edit",
        tool_name: "str_replace_editor",
        action: {
          kind: "FileEditorAction",
          command: "str_replace",
          path: "/workspace/project/src/app.ts",
        },
      }),
    );
    aggregator.applyEvent(
      actionEvent({
        id: "view-1",
        tool_call_id: "call-view",
        tool_name: "str_replace_editor",
        action: {
          kind: "FileEditorAction",
          command: "view",
          path: "/workspace/project/README.md",
        },
      }),
    );
    expect(aggregator.run.artifacts).toEqual(["/workspace/project/src/app.ts"]);
  });
});

describe("RunAggregator — LLM spans from ConversationStats", () => {
  const stats = {
    usage_to_metrics: {
      default: {
        model_name: "claude-opus-5",
        accumulated_cost: 0.42,
        max_budget_per_task: 5,
        accumulated_token_usage: null,
        costs: [{ model: "claude-opus-5", cost: 0.42, timestamp: 1767225600 }],
        response_latencies: [
          { model: "claude-opus-5", latency: 2.5, response_id: "resp-1" },
        ],
        token_usages: [
          {
            model: "claude-opus-5",
            prompt_tokens: 1000,
            completion_tokens: 200,
            cache_read_tokens: 50,
            cache_write_tokens: 10,
            reasoning_tokens: 5,
            context_window: 200000,
            per_turn_token: 1200,
            response_id: "resp-1",
          },
        ],
      },
    },
  };

  it("emits one LLM span per completion, joined to its cost and latency", () => {
    const aggregator = new RunAggregator(newRun());
    const result = aggregator.applyStats(stats, OBSERVED_AT);

    expect(result.spans).toHaveLength(1);
    const [span] = result.spans;
    expect(span.kind).toBe("llm");
    expect(span.attributes["gen_ai.response.model"]).toBe("claude-opus-5");
    expect(span.attributes["gen_ai.usage.prompt_tokens"]).toBe(1000);
    expect(span.attributes["gen_ai.usage.total_tokens"]).toBe(1200);
    expect(span.attributes["gen_ai.usage.total_cost"]).toBe(0.42);
    expect(span.attributes["gen_ai.streaming.time_to_generate"]).toBe(2.5);

    expect(aggregator.run.costUsd).toBe(0.42);
    expect(aggregator.run.maxBudgetPerTask).toBe(5);
    expect(aggregator.run.tokens.total).toBe(1200);
  });

  it("does not re-emit spans for completions already seen", () => {
    const aggregator = new RunAggregator(newRun());
    aggregator.applyStats(stats, OBSERVED_AT);
    const second = aggregator.applyStats(stats, OBSERVED_AT);
    expect(second.spans).toHaveLength(0);
    // Totals stay authoritative rather than doubling.
    expect(aggregator.run.costUsd).toBe(0.42);
    expect(aggregator.run.tokens.total).toBe(1200);
    expect(aggregator.run.llmCallCount).toBe(1);
  });

  it("derives llmCallCount from the stats totals, so a rebuilt aggregator does not re-add calls", () => {
    // Regression: a finished run's aggregator was rebuilt from the store on
    // every poll with an empty llmCursor, and the incremented count grew by
    // the whole call history each tick (252 → 366 in 40s for a 7-call run).
    const run = { ...newRun(), llmCallCount: 252 };
    const rebuilt = new RunAggregator(run);
    rebuilt.applyStats(stats, OBSERVED_AT);
    expect(rebuilt.run.llmCallCount).toBe(1);
    rebuilt.applyStats(stats, OBSERVED_AT);
    expect(rebuilt.run.llmCallCount).toBe(1);
  });

  it("folds the socket's live stats update exactly like the polled stats", () => {
    // The runtime pushes ConversationStateUpdateEvent{key:"stats"} on the
    // events socket after every completion, including the ones made while a
    // tool call blocks the REST search. It is the same ConversationStats.
    const aggregator = new RunAggregator(newRun());
    const result = aggregator.applyEvent({
      id: "evt-stats-1",
      kind: "ConversationStateUpdateEvent",
      key: "stats",
      value: stats,
      timestamp: "2026-01-01T00:00:00.000000",
      source: "environment",
    });

    expect("statsApplied" in result && result.statsApplied).toBe(true);
    expect(result.spans).toHaveLength(1);
    expect(aggregator.run.costUsd).toBe(0.42);
    expect(aggregator.run.llmCallCount).toBe(1);

    // The REST tail replays the same event later: nothing is counted twice.
    const replay = aggregator.applyEvent({
      id: "evt-stats-1",
      kind: "ConversationStateUpdateEvent",
      key: "stats",
      value: stats,
      timestamp: "2026-01-01T00:00:00.000000",
      source: "environment",
    });
    expect(replay.spans).toHaveLength(0);
    expect(aggregator.run.costUsd).toBe(0.42);
  });

  it("ignores state updates that carry no stats", () => {
    const aggregator = new RunAggregator(newRun());
    const result = aggregator.applyEvent({
      id: "evt-status-1",
      kind: "ConversationStateUpdateEvent",
      key: "agent_status",
      value: "running",
      timestamp: "2026-01-01T00:00:00.000000",
      source: "environment",
    });
    expect(result.spans).toHaveLength(0);
    expect("statsApplied" in result).toBe(false);
    expect(aggregator.run.costUsd).toBe(0);
  });

  it("reports a missing cost as null, never as zero", () => {
    const aggregator = new RunAggregator(newRun());
    const noCost = {
      usage_to_metrics: {
        default: {
          ...stats.usage_to_metrics.default,
          costs: [],
        },
      },
    };
    const [span] = aggregator.applyStats(noCost, OBSERVED_AT).spans;
    expect(span.attributes["gen_ai.usage.total_cost"]).toBeNull();
  });

  it("picks run.model by completion timestamp, not by usage-id iteration order", () => {
    // Regression: two usage ids (e.g. the main agent LLM and a condenser)
    // both get newly-appended entries in one poll. `Object.entries()` visits
    // them in insertion order, which is unrelated to which one actually
    // completed most recently by wall-clock time — the condenser here is
    // inserted *after* "agent" but its completion happened *earlier*.
    const aggregator = new RunAggregator(newRun());
    const multiUsage = {
      usage_to_metrics: {
        agent: {
          model_name: "claude-opus-5",
          accumulated_cost: 0.1,
          costs: [{ model: "claude-opus-5", cost: 0.1, timestamp: 2000 }],
          response_latencies: [],
          token_usages: [
            { model: "claude-opus-5", prompt_tokens: 10, response_id: "r-1" },
          ],
        },
        condenser: {
          model_name: "claude-haiku-4-5",
          accumulated_cost: 0.01,
          costs: [{ model: "claude-haiku-4-5", cost: 0.01, timestamp: 1000 }],
          response_latencies: [],
          token_usages: [
            {
              model: "claude-haiku-4-5",
              prompt_tokens: 5,
              response_id: "r-2",
            },
          ],
        },
      },
    };

    aggregator.applyStats(multiUsage, OBSERVED_AT);

    // "agent" (timestamp 2000) is the true latest completion even though
    // "condenser" is iterated after it.
    expect(aggregator.run.model).toBe("claude-opus-5");
  });
});

describe("RunAggregator — status transitions", () => {
  it("audits completion, failure, pause, resume and approval waits", () => {
    const aggregator = new RunAggregator(newRun());
    expect(aggregator.applyStatus("running", OBSERVED_AT).audit).toEqual([]);

    expect(
      aggregator.applyStatus("paused", OBSERVED_AT).audit[0],
    ).toMatchObject({
      action: "run.paused",
    });
    expect(
      aggregator.applyStatus("running", OBSERVED_AT).audit[0],
    ).toMatchObject({
      action: "run.resumed",
    });
    expect(
      aggregator.applyStatus("waiting_for_confirmation", OBSERVED_AT).audit[0],
    ).toMatchObject({ action: "approval.requested" });
    expect(aggregator.run.phase).toBe("waiting_approval");

    const finished = aggregator.applyStatus("finished", OBSERVED_AT);
    expect(finished.audit[0]).toMatchObject({ action: "task.completed" });
    expect(aggregator.run.phase).toBe("completed");
    expect(aggregator.run.endedAt).toBe(OBSERVED_AT);
  });

  it("classifies active and terminal statuses", () => {
    expect(isActiveStatus("running")).toBe(true);
    expect(isActiveStatus("waiting_for_confirmation")).toBe(true);
    expect(isActiveStatus("finished")).toBe(false);
    expect(isTerminalStatus("error")).toBe(true);
    expect(isTerminalStatus("paused")).toBe(false);
  });

  it("treats a stuck run as halted history, not a live run", () => {
    // The runtime's loop detector has given up on it: `/interrupt` is a
    // no-op and `/run` re-trips the detector immediately, so only a new user
    // message restarts it — the same way the SDK treats FINISHED.
    expect(isActiveStatus("stuck")).toBe(false);
    expect(isTerminalStatus("stuck")).toBe(true);

    const aggregator = new RunAggregator(newRun());
    const stuck = aggregator.applyStatus("stuck", OBSERVED_AT);
    expect(stuck.audit).toEqual([
      expect.objectContaining({ action: "task.stuck", actor: "agent" }),
    ]);
    expect(aggregator.run.endedAt).toBe(OBSERVED_AT);

    // A follow-up user message resets it and the run goes live again.
    aggregator.applyStatus("running", OBSERVED_AT);
    expect(aggregator.run.endedAt).toBeNull();
  });

  it("keeps the completed phase when tool events are applied after the run finished", () => {
    // The last tool call and the "finished" status often land in the same
    // collector tick (or the tool events get re-tailed on a later one). The
    // event must still be counted, but it must not drag a finished run's
    // phase back from "completed" to "tool_call".
    const aggregator = new RunAggregator(newRun());
    aggregator.applyStatus("finished", OBSERVED_AT);
    expect(aggregator.run.phase).toBe("completed");

    const result = aggregator.applyEvent(
      actionEvent({
        action: { kind: "TerminalAction", command: "sleep 15" },
      }),
    );

    expect(result.spans).toHaveLength(1);
    expect(aggregator.run.toolCallCount).toBe(1);
    expect(aggregator.run.phase).toBe("completed");
  });

  it("keeps the completed phase when the first user message is tailed after the run finished", () => {
    // A run first observed already finished starts in phase "completed"
    // (createRun); tailing its opening user message afterwards must not reset
    // it to "planning".
    const aggregator = new RunAggregator(
      createRun(
        {
          id: "run-1",
          title: "Already done",
          executionStatus: "finished",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        OBSERVED_AT,
      ),
    );

    aggregator.applyEvent({
      id: "evt-user",
      timestamp: "2026-01-01T00:00:00.500Z",
      source: "user",
      llm_message: { role: "user", content: "Run sleep 15 three times" },
    });

    expect(aggregator.run.phase).toBe("completed");
  });

  it("still moves the phase with tool events while the run is live", () => {
    const aggregator = new RunAggregator(newRun());
    aggregator.applyStatus("running", OBSERVED_AT);
    aggregator.applyEvent(
      actionEvent({
        action: { kind: "TerminalAction", command: "sleep 15" },
      }),
    );
    expect(aggregator.run.phase).toBe("tool_call");
  });
});

describe("RunAggregator — pause mid tool call, resume, finish", () => {
  it("leaves errorCount at 0 so the run is not counted as a failure", () => {
    const aggregator = new RunAggregator(newRun());
    aggregator.applyEvent(
      actionEvent({
        action: { kind: "ExecuteBashAction", command: "sleep 20 && echo one" },
      }),
    );

    // Control Tower Pause → /interrupt: the runtime pauses and backfills the
    // in-flight tool call with its synthetic interruption error.
    const paused = aggregator.applyStatus("paused", "2026-01-02T00:00:02.000Z");
    expect(paused.audit[0]).toMatchObject({ action: "run.paused" });
    const interrupted = aggregator.applyEvent({
      id: "evt-2",
      timestamp: "2026-01-02T00:00:02.100Z",
      source: "agent",
      tool_name: "execute_bash",
      tool_call_id: "call-1",
      error:
        "Tool call interrupted before completion. The conversation was paused.",
    });
    expect(interrupted.spans[0].status).toBe("interrupted");

    // Resume, run the next command, and finish normally.
    const resumed = aggregator.applyStatus(
      "running",
      "2026-01-02T00:00:05.000Z",
    );
    expect(resumed.audit[0]).toMatchObject({ action: "run.resumed" });
    aggregator.applyEvent(
      actionEvent({
        id: "evt-3",
        timestamp: "2026-01-02T00:00:06.000Z",
        tool_call_id: "call-2",
        action: {
          kind: "ExecuteBashAction",
          command: "sleep 26 && echo seven",
        },
      }),
    );
    const done = aggregator.applyEvent({
      id: "evt-4",
      timestamp: "2026-01-02T00:00:33.000Z",
      source: "environment",
      action_id: "evt-3",
      tool_name: "execute_bash",
      tool_call_id: "call-2",
      observation: { kind: "ExecuteBashObservation", output: "seven" },
    });
    expect(done.spans[0].status).toBe("succeeded");
    aggregator.applyStatus("finished", "2026-01-02T00:00:34.000Z");

    expect(aggregator.run.status).toBe("finished");
    expect(aggregator.run.phase).toBe("completed");
    expect(aggregator.run.errorCount).toBe(0);
    expect(aggregator.run.toolCallCount).toBe(2);

    const summary = summarize(
      [aggregator.run],
      [],
      new Date("2026-01-02T01:00:00.000Z"),
    );
    expect(summary.runsToday).toBe(1);
    expect(summary.failures).toBe(0);
  });
});

describe("createRun — initial phase", () => {
  it("starts a run already in a terminal status with the matching terminal phase", () => {
    const finished = createRun(
      {
        id: "run-finished",
        title: "Already done by the time we saw it",
        executionStatus: "finished",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      OBSERVED_AT,
    );
    expect(finished.status).toBe("finished");
    expect(finished.phase).toBe("completed");
  });

  it("starts a run already waiting for confirmation with the waiting_approval phase", () => {
    const waiting = createRun(
      {
        id: "run-waiting",
        title: "Already waiting by the time we saw it",
        executionStatus: "waiting_for_confirmation",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      OBSERVED_AT,
    );
    expect(waiting.status).toBe("waiting_for_confirmation");
    expect(waiting.phase).toBe("waiting_approval");
  });

  it("defaults every other first-observed status to planning", () => {
    for (const status of ["idle", "running", "paused", "error", "stuck"]) {
      const run = createRun(
        { id: `run-${status}`, title: "Task", executionStatus: status },
        OBSERVED_AT,
      );
      expect(run.phase).toBe("planning");
    }
  });
});

describe("privacy invariant", () => {
  it("never persists thought, reasoning_content or thinking_blocks", () => {
    const aggregator = new RunAggregator(newRun());
    const secret = "SECRET-CHAIN-OF-THOUGHT";
    const result = aggregator.applyEvent(
      actionEvent({
        thought: [{ type: "text", text: secret }],
        reasoning_content: secret,
        thinking_blocks: [{ type: "thinking", thinking: secret }],
        summary: "Run the test suite",
      }),
    );

    const serialized = JSON.stringify({
      spans: result.spans,
      audit: result.audit,
      run: aggregator.run,
    });
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("reasoning_content");
    expect(serialized).not.toContain("thinking_blocks");
    // The agent's own exposed label is kept — it is what an approver reads.
    expect(result.spans[0].attributes["neodevex.action.summary"]).toBe(
      "Run the test suite",
    );
  });
});

describe("summarizeActionParameters", () => {
  it("truncates oversized values instead of storing whole files", () => {
    const params: Record<string, string> = summarizeActionParameters(
      { kind: "FileEditorAction", file_text: "x".repeat(5000) },
      100,
    );
    expect(params.kind).toBeUndefined();
    expect(params.file_text).toContain("truncated 4900 chars");
    expect(params.file_text.length).toBeLessThan(200);
  });
});
