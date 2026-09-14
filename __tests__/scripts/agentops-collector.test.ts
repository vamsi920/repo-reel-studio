import { describe, expect, it, vi } from "vitest";

import { Collector } from "../../scripts/agentops/collector.mjs";

/**
 * Collector talks to two injected dependencies (`client`, `store`) with the
 * exact same interface the real agent-server client / AgentOpsStore expose,
 * so both can be faked here without a network call or a real DB.
 */
function makeStore(overrides: Record<string, unknown> = {}) {
  const appendedAudit: Array<Record<string, unknown>> = [];
  return {
    appendedAudit,
    getRun: vi.fn().mockResolvedValue(null),
    upsertRun: vi.fn().mockResolvedValue(undefined),
    appendSpans: vi.fn().mockResolvedValue(undefined),
    appendAudit: vi.fn(async (record: Record<string, unknown>) => {
      appendedAudit.push(record);
      return { id: "audit-id", ...record };
    }),
    getWorkspacePolicy: vi.fn().mockResolvedValue({
      workspaceId: "ws",
      monthlyBudgetUsd: 100,
      runBudgetUsd: null,
      agentBudgetUsd: null,
      warnThresholdPct: [50, 80, 100],
      allowedTools: null,
      autonomyLevel: "assisted",
      approvalThresholds: { securityRisk: "HIGH", costUsd: null },
    }),
    getAgentBudget: vi.fn().mockResolvedValue(null),
    listRuns: vi.fn().mockResolvedValue([
      {
        workspaceId: "ws",
        agentName: "agent",
        costUsd: 60,
        updatedAt: "2026-01-15T00:00:00.000Z",
        tokens: {},
      },
    ]),
    listApprovals: vi.fn().mockResolvedValue([]),
    upsertApproval: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    searchConversations: vi.fn().mockResolvedValue({
      items: [
        {
          id: "run-1",
          title: "Fix the flaky test",
          execution_status: "running",
          workspace: { working_dir: "ws" },
          updated_at: "2026-01-15T00:05:00.000Z",
          created_at: "2026-01-15T00:00:00.000Z",
        },
      ],
    }),
    searchEvents: vi.fn().mockResolvedValue({ items: [] }),
    interruptConversation: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("Collector event-tail cursor", () => {
  it("resumes tailing from the stored cursor instead of replaying the whole conversation", async () => {
    // Regression test for the Supabase store bug where a restarted collector
    // always saw lastEventTimestamp: null and re-tailed every event from the
    // start (see supabase-store.mjs's rowToRun fix + its own cursor test).
    const store = makeStore({
      getRun: vi.fn().mockResolvedValue({
        runId: "run-1",
        workspaceId: "ws",
        agentName: "agent",
        task: "Fix the flaky test",
        status: "running",
        model: null,
        phase: "tool_call",
        startedAt: "2026-01-15T00:00:00.000Z",
        endedAt: null,
        updatedAt: "2026-01-15T00:04:00.000Z",
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
        lastEventTimestamp: "2026-01-15T00:04:30.000Z",
        lastEventIds: ["evt-1"],
      }),
    });
    const client = makeClient();
    const collector = new Collector({
      client,
      store,
      now: () => "2026-01-15T00:05:00.000Z",
    });

    await collector.tick();

    expect(client.searchEvents).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ timestampGte: "2026-01-15T00:04:30.000Z" }),
    );
  });

  it("tails from the start for a run the store has never seen", async () => {
    const store = makeStore();
    const client = makeClient();
    const collector = new Collector({
      client,
      store,
      now: () => "2026-01-15T00:05:00.000Z",
    });

    await collector.tick();

    const [, params] = client.searchEvents.mock.calls[0];
    expect(params.timestampGte).toBeUndefined();
  });
});

describe("Collector timestamp normalization", () => {
  // Regression: the agent-server's events and conversation records carry
  // offset-less timestamps. The audit rows and run fields built from them
  // must be stored as zoned UTC so they render on the same clock as the
  // collector's own `now()` records — but the tail cursor sent back to the
  // agent-server as `timestamp__gte` must stay in the runtime's own form.
  it("stores zoned UTC for event and conversation timestamps but keeps the raw tail cursor", async () => {
    const store = makeStore();
    const client = makeClient({
      searchConversations: vi.fn().mockResolvedValue({
        items: [
          {
            id: "run-1",
            title: "Naive clocks",
            execution_status: "running",
            updated_at: "2026-09-14T01:58:00.000000",
            created_at: "2026-09-14T01:52:55.122847",
            workspace: { working_dir: "ws" },
          },
        ],
      }),
      searchEvents: vi.fn().mockResolvedValue({
        items: [
          {
            id: "evt-action",
            timestamp: "2026-09-14T01:58:03.915000",
            source: "agent",
            tool_name: "terminal",
            tool_call_id: "call-1",
            action: { kind: "TerminalAction", command: "sleep 1" },
          },
        ],
      }),
    });
    const collector = new Collector({
      client,
      store,
      now: () => "2026-09-14T01:58:05.000Z",
    });

    await collector.tick();

    expect(store.upsertRun).toHaveBeenCalledWith(
      expect.objectContaining({
        startedAt: "2026-09-14T01:52:55.122847Z",
        updatedAt: "2026-09-14T01:58:00.000000Z",
        lastEventTimestamp: "2026-09-14T01:58:03.915000",
      }),
    );
    expect(
      store.appendedAudit.find((record) => record.action === "tool.called"),
    ).toMatchObject({ at: "2026-09-14T01:58:03.915000Z" });
    expect(store.appendSpans).toHaveBeenCalledWith("run-1", [
      expect.objectContaining({ startTime: "2026-09-14T01:58:03.915000Z" }),
    ]);

    // The next tick resumes from the runtime's own timestamp form.
    await collector.tick();
    const lastParams = client.searchEvents.mock.calls.at(-1)?.[1];
    expect(lastParams.timestampGte).toBe("2026-09-14T01:58:03.915000");
  });
});

describe("Collector same-tick completion", () => {
  it("keeps phase completed when the last tool call and the finished status land in the same tick", async () => {
    // Regression: applyStatus("finished") set phase "completed", then the
    // tool events tailed in the same tick overwrote it with "tool_call", so
    // History showed a finished run as Progress "Tool call".
    const store = makeStore();
    const client = makeClient({
      searchConversations: vi.fn().mockResolvedValue({
        items: [
          {
            id: "run-1",
            title: "Run sleep 15 three times",
            execution_status: "finished",
            workspace: { working_dir: "ws" },
            updated_at: "2026-01-15T00:05:00.000Z",
            created_at: "2026-01-15T00:00:00.000Z",
          },
        ],
      }),
      searchEvents: vi.fn().mockResolvedValue({
        items: [
          {
            id: "evt-user",
            timestamp: "2026-01-15T00:00:01.000Z",
            source: "user",
            llm_message: { role: "user", content: "Run sleep 15 three times" },
          },
          {
            id: "evt-action",
            timestamp: "2026-01-15T00:04:50.000Z",
            source: "agent",
            tool_name: "terminal",
            tool_call_id: "call-1",
            action: { kind: "TerminalAction", command: "sleep 15" },
          },
          {
            id: "evt-observation",
            timestamp: "2026-01-15T00:04:55.000Z",
            source: "environment",
            action_id: "evt-action",
            tool_call_id: "call-1",
            observation: { output: "" },
          },
        ],
      }),
    });
    // The store already knows the run as "running" from an earlier tick.
    store.getRun.mockResolvedValue({
      runId: "run-1",
      workspaceId: "ws",
      agentName: "agent",
      task: "Run sleep 15 three times",
      status: "running",
      model: null,
      phase: "planning",
      startedAt: "2026-01-15T00:00:00.000Z",
      endedAt: null,
      updatedAt: "2026-01-15T00:04:00.000Z",
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
      toolCallCount: 2,
      llmCallCount: 0,
      errorCount: 0,
      artifacts: [],
      lastEventId: null,
      lastEventTimestamp: null,
      lastEventIds: [],
    });
    const collector = new Collector({
      client,
      store,
      now: () => "2026-01-15T00:05:00.000Z",
    });

    await collector.tick();

    expect(store.upsertRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "finished",
        phase: "completed",
        toolCallCount: 3,
      }),
    );

    // The completion is recorded after the tool call it followed, and its
    // summary counts that call.
    const actions = store.appendedAudit.map((record) => record.action);
    expect(actions.indexOf("tool.called")).toBeGreaterThan(-1);
    expect(actions.indexOf("task.completed")).toBeGreaterThan(
      actions.indexOf("tool.called"),
    );
    expect(
      store.appendedAudit.find((record) => record.action === "task.completed"),
    ).toMatchObject({ summary: "Run completed after 3 tool calls" });
  });

  it("keeps phase completed for a run first observed already finished whose events are tailed in the same tick", async () => {
    const store = makeStore();
    const client = makeClient({
      searchConversations: vi.fn().mockResolvedValue({
        items: [
          {
            id: "run-2",
            title: "Fast run",
            execution_status: "finished",
            workspace: { working_dir: "ws" },
            updated_at: "2026-01-15T00:05:00.000Z",
            created_at: "2026-01-15T00:00:00.000Z",
          },
        ],
      }),
      searchEvents: vi.fn().mockResolvedValue({
        items: [
          {
            id: "evt-user",
            timestamp: "2026-01-15T00:00:01.000Z",
            source: "user",
            llm_message: { role: "user", content: "Fast run" },
          },
          {
            id: "evt-action",
            timestamp: "2026-01-15T00:00:02.000Z",
            source: "agent",
            tool_name: "terminal",
            tool_call_id: "call-1",
            action: { kind: "TerminalAction", command: "sleep 1" },
          },
        ],
      }),
    });
    const collector = new Collector({
      client,
      store,
      now: () => "2026-01-15T00:05:00.000Z",
    });

    await collector.tick();

    expect(store.upsertRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "finished",
        phase: "completed",
        toolCallCount: 1,
      }),
    );
  });
});

describe("Collector budget warning dedup", () => {
  it("warns again for the same threshold crossed in the same calendar month a year later", async () => {
    // Regression test: the dedup key used to be
    // `${workspaceId}:${thresholdPct}:${getUTCMonth()}` with no year, so
    // January 2026 and January 2027 collided and the second year's warning
    // was silently swallowed for the collector process's lifetime.
    let now = "2026-01-15T00:00:00.000Z";
    const store = makeStore({
      // computeSpend()'s `within()` filters runs by `updatedAt >= since`
      // (this month's start), so the fixture's spend must fall inside
      // whichever month is current when listRuns() is read.
      listRuns: vi.fn(async () => [
        {
          workspaceId: "ws",
          agentName: "agent",
          costUsd: 60,
          updatedAt: now,
          tokens: {},
        },
      ]),
    });
    const client = makeClient();
    const collector = new Collector({
      client,
      store,
      now: () => now,
      logger: { ...console, error: () => {} },
    });

    await collector.tick();
    now = "2027-01-15T00:00:00.000Z";
    await collector.tick();

    const warnings = store.appendedAudit.filter(
      (record) => record.action === "budget.warning",
    );
    expect(warnings).toHaveLength(2);
  });

  it("does not repeat the same warning within the same month", async () => {
    const store = makeStore();
    const client = makeClient();
    const collector = new Collector({
      client,
      store,
      now: () => "2026-01-15T00:00:00.000Z",
    });

    await collector.tick();
    await collector.tick();

    const warnings = store.appendedAudit.filter(
      (record) => record.action === "budget.warning",
    );
    expect(warnings).toHaveLength(1);
  });
});
