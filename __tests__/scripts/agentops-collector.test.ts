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

describe("Collector finished-run idempotence", () => {
  const finishedConversation = {
    id: "run-1",
    title: "Six commands",
    execution_status: "finished",
    updated_at: "2026-09-14T02:00:00.000Z",
    created_at: "2026-09-14T01:50:00.000Z",
    workspace: { working_dir: "ws" },
    stats: {
      usage_to_metrics: {
        default: {
          model_name: "claude-opus-5",
          accumulated_cost: 0.1,
          costs: [
            { model: "claude-opus-5", cost: 0.05, timestamp: 1789350000 },
            { model: "claude-opus-5", cost: 0.05, timestamp: 1789350010 },
          ],
          response_latencies: [],
          token_usages: [
            {
              model: "claude-opus-5",
              prompt_tokens: 10,
              completion_tokens: 1,
              response_id: "r1",
            },
            {
              model: "claude-opus-5",
              prompt_tokens: 10,
              completion_tokens: 1,
              response_id: "r2",
            },
          ],
        },
      },
    },
  };
  const events = [
    {
      id: "evt-action",
      timestamp: "2026-09-14T01:58:03.915000",
      source: "agent",
      tool_name: "terminal",
      tool_call_id: "call-1",
      action: { kind: "TerminalAction", command: "sleep 1" },
    },
    {
      id: "evt-observation",
      timestamp: "2026-09-14T01:58:29.364000",
      source: "environment",
      action_id: "evt-action",
      tool_call_id: "call-1",
      observation: { output: "" },
    },
    // The runtime serves this state event *after* the newer observation.
    {
      id: "evt-state",
      timestamp: "2026-09-14T01:58:03.914000",
      source: "environment",
      kind: "ConversationStateUpdateEvent",
      key: "execution_status",
      value: "running",
    },
  ];

  /** A store whose getRun returns what upsertRun last saved, like the real ones. */
  function persistentStore() {
    const runs = new Map<string, Record<string, unknown>>();
    return makeStore({
      getRun: vi.fn(async (runId: string) => {
        const run = runs.get(runId);
        return run ? structuredClone(run) : null;
      }),
      upsertRun: vi.fn(async (run: Record<string, unknown>) => {
        runs.set(run.runId as string, structuredClone(run));
      }),
    });
  }

  /** An events/search fake honouring timestamp__gte like the agent-server. */
  function searchEventsFake() {
    return vi.fn(async (_runId: string, params: { timestampGte?: string }) => ({
      items: events.filter(
        (event) =>
          !params.timestampGte || event.timestamp >= params.timestampGte,
      ),
    }));
  }

  it("does not re-count a finished run on later ticks", async () => {
    // Regression: the run detail's TOOL CALLS / LLM CALLS and the audit log
    // grew on every poll after the run had ended (toolCallCount 56 → 75,
    // llmCallCount 252 → 366 in 40s for a six-command run).
    const store = persistentStore();
    const client = makeClient({
      searchConversations: vi
        .fn()
        .mockResolvedValue({ items: [finishedConversation] }),
      searchEvents: searchEventsFake(),
    });
    const collector = new Collector({
      client,
      store,
      now: () => "2026-09-14T02:00:05.000Z",
    });

    await collector.tick();
    const firstRun = store.upsertRun.mock.calls.at(-1)?.[0];
    expect(firstRun).toMatchObject({
      status: "finished",
      toolCallCount: 1,
      llmCallCount: 2,
    });
    const auditAfterFirst = store.appendedAudit.length;
    expect(
      store.appendedAudit.filter((record) => record.action === "tool.called"),
    ).toHaveLength(1);

    await collector.tick();
    await collector.tick();
    await collector.tick();

    const lastRun = store.upsertRun.mock.calls.at(-1)?.[0];
    expect(lastRun).toMatchObject({ toolCallCount: 1, llmCallCount: 2 });
    expect(store.appendedAudit).toHaveLength(auditAfterFirst);
    // Once settled, the run is not re-tailed at all.
    expect(client.searchEvents.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("never moves the event cursor backwards on an out-of-order page", async () => {
    const store = persistentStore();
    const client = makeClient({
      searchConversations: vi.fn().mockResolvedValue({
        items: [{ ...finishedConversation, execution_status: "running" }],
      }),
      searchEvents: searchEventsFake(),
    });
    const collector = new Collector({
      client,
      store,
      now: () => "2026-09-14T02:00:05.000Z",
    });

    await collector.tick();
    expect(store.upsertRun.mock.calls.at(-1)?.[0]).toMatchObject({
      lastEventTimestamp: "2026-09-14T01:58:29.364000",
      lastEventIds: ["evt-observation"],
      toolCallCount: 1,
    });

    await collector.tick();
    expect(client.searchEvents.mock.calls.at(-1)?.[1]).toMatchObject({
      timestampGte: "2026-09-14T01:58:29.364000",
    });
    expect(store.upsertRun.mock.calls.at(-1)?.[0]).toMatchObject({
      toolCallCount: 1,
    });
    expect(
      store.appendedAudit.filter((record) => record.action === "tool.called"),
    ).toHaveLength(1);
  });

  it("picks a finished run back up when a follow-up message restarts it", async () => {
    const searchConversations = vi
      .fn()
      .mockResolvedValue({ items: [finishedConversation] });
    const store = persistentStore();
    const client = makeClient({
      searchConversations,
      searchEvents: searchEventsFake(),
    });
    const collector = new Collector({
      client,
      store,
      now: () => "2026-09-14T02:00:05.000Z",
    });

    await collector.tick();
    await collector.tick(); // settles
    searchConversations.mockResolvedValue({
      items: [{ ...finishedConversation, execution_status: "running" }],
    });
    await collector.tick();
    expect(store.upsertRun.mock.calls.at(-1)?.[0]).toMatchObject({
      status: "running",
      endedAt: null,
    });
  });

  it("drops trackers for conversations that left the search page", async () => {
    const searchConversations = vi
      .fn()
      .mockResolvedValue({ items: [finishedConversation] });
    const store = persistentStore();
    const client = makeClient({
      searchConversations,
      searchEvents: searchEventsFake(),
    });
    const collector = new Collector({
      client,
      store,
      now: () => "2026-09-14T02:00:05.000Z",
    });

    await collector.tick();
    expect(collector.tracked.has("run-1")).toBe(true);
    searchConversations.mockResolvedValue({ items: [] });
    await collector.tick();
    expect(collector.tracked.has("run-1")).toBe(false);
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

describe("Collector budget enforcement on halted runs", () => {
  it("does not interrupt a stuck run or open a budget approval for it", async () => {
    // The runtime has already halted a stuck run and ignores /interrupt on
    // it; an approval whose "approve" would try to /run it would only flip
    // it running→stuck again. Nothing live is left to govern.
    const store = makeStore({
      getWorkspacePolicy: vi.fn().mockResolvedValue({
        workspaceId: "ws",
        monthlyBudgetUsd: 100,
        runBudgetUsd: 1,
        agentBudgetUsd: null,
        warnThresholdPct: [50, 80, 100],
        allowedTools: null,
        autonomyLevel: "assisted",
        approvalThresholds: { securityRisk: "HIGH", costUsd: null },
      }),
    });
    let executionStatus = "running";
    const client = makeClient({
      searchConversations: vi.fn(async () => ({
        items: [
          {
            id: "run-stuck",
            title: "Loops forever",
            execution_status: executionStatus,
            workspace: { working_dir: "ws" },
            updated_at: "2026-01-15T00:05:00.000Z",
            created_at: "2026-01-15T00:00:00.000Z",
            stats: {
              usage_to_metrics: {
                agent: {
                  accumulated_cost: 5,
                  accumulated_token_usage: {},
                  costs: [],
                  response_latencies: [],
                  token_usages: [],
                },
              },
            },
          },
        ],
      })),
    });
    const collector = new Collector({
      client,
      store,
      now: () => "2026-01-15T00:06:00.000Z",
    });

    // First tick: the run is over budget while running, so it is halted for
    // real and an approval is opened — the normal path.
    expect(await collector.tick()).toBe(true);
    expect(client.interruptConversation).toHaveBeenCalledTimes(1);
    expect(store.upsertApproval).toHaveBeenCalledTimes(1);

    // Second tick: the runtime's loop detector has halted it. Nothing live
    // is left to govern — no second interrupt, no second approval.
    executionStatus = "stuck";
    store.listApprovals.mockResolvedValue([]);
    const hasActive = await collector.tick();

    expect(hasActive).toBe(false);
    expect(client.interruptConversation).toHaveBeenCalledTimes(1);
    expect(store.upsertApproval).toHaveBeenCalledTimes(1);
    expect(store.appendedAudit.map((record) => record.action)).toContain(
      "task.stuck",
    );
    expect(store.upsertRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run-stuck", status: "stuck" }),
    );
  });
});

describe("Collector budget enforcement after a rejected approval", () => {
  it("does not re-raise the breach on a run that stayed paused after its approval was rejected", async () => {
    // Regression test: the breach dedup only looked at *pending* approvals,
    // so the moment an operator rejected one, the still-paused, still-over-
    // budget run tripped the same breach on the next tick — a new pending
    // approval, another /interrupt, and another budget.exceeded + run.paused
    // audit pair, forever. Rejecting could never be made to stick.
    const store = makeStore({
      getWorkspacePolicy: vi.fn().mockResolvedValue({
        workspaceId: "ws",
        monthlyBudgetUsd: 100,
        runBudgetUsd: 0.01,
        agentBudgetUsd: null,
        warnThresholdPct: [50, 80, 100],
        allowedTools: null,
        autonomyLevel: "assisted",
        approvalThresholds: { securityRisk: "HIGH", costUsd: null },
      }),
    });
    let executionStatus = "running";
    const client = makeClient({
      searchConversations: vi.fn(async () => ({
        items: [
          {
            id: "run-rejected",
            title: "Run Sequential Sleep Commands",
            execution_status: executionStatus,
            workspace: { working_dir: "ws" },
            updated_at: "2026-01-15T00:05:00.000Z",
            created_at: "2026-01-15T00:00:00.000Z",
            stats: {
              usage_to_metrics: {
                agent: {
                  accumulated_cost: 0.0497,
                  accumulated_token_usage: {},
                  costs: [],
                  response_latencies: [],
                  token_usages: [],
                },
              },
            },
          },
        ],
      })),
    });
    const collector = new Collector({
      client,
      store,
      now: () => "2026-01-15T00:06:00.000Z",
    });
    // The enforcement's own audit pair — not the status-derived "Run paused"
    // row that the running→paused transition legitimately emits once.
    const budgetAudit = () =>
      store.appendedAudit.filter(
        (record) =>
          record.action === "budget.exceeded" ||
          record.summary === "Run halted because a budget was exceeded",
      );

    // Tick 1: over budget while running — halted for real, approval opened.
    await collector.tick();
    expect(client.interruptConversation).toHaveBeenCalledTimes(1);
    expect(store.upsertApproval).toHaveBeenCalledTimes(1);
    expect(budgetAudit()).toHaveLength(2);

    // The operator rejects it: the approval leaves the pending list and the
    // runtime reports the run as paused. Nothing new may be raised.
    executionStatus = "paused";
    store.listApprovals.mockResolvedValue([]);
    await collector.tick();
    await collector.tick();
    expect(client.interruptConversation).toHaveBeenCalledTimes(1);
    expect(store.upsertApproval).toHaveBeenCalledTimes(1);
    expect(budgetAudit()).toHaveLength(2);

    // The operator resumes the run without raising the limit: it is spending
    // again, so the breach is raised again — once.
    executionStatus = "running";
    await collector.tick();
    expect(client.interruptConversation).toHaveBeenCalledTimes(2);
    expect(store.upsertApproval).toHaveBeenCalledTimes(2);
    expect(budgetAudit()).toHaveLength(4);
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
