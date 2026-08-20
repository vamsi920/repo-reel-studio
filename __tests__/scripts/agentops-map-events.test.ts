import { describe, expect, it } from "vitest";

import {
  RunAggregator,
  createRun,
  phaseForAction,
  summarizeActionParameters,
  isActiveStatus,
  isTerminalStatus,
} from "../../scripts/agentops/map-events.mjs";

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
