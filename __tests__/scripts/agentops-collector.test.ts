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
    listSpans: vi.fn().mockResolvedValue([]),
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

  it("does not re-announce task.started for a follow-up after a restart", async () => {
    // The stored run has an event cursor, so its opening user message was
    // tailed by the previous collector process; the message tailed now is a
    // follow-up, not the task.
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
    const client = makeClient({
      searchEvents: vi.fn().mockResolvedValue({
        items: [
          {
            id: "evt-user-2",
            timestamp: "2026-01-15T00:04:45.000Z",
            source: "user",
            llm_message: { role: "user", content: "Also fix lint" },
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

    const userRows = store.appendedAudit.filter(
      (record) => record.actor === "user",
    );
    expect(userRows).toEqual([
      expect.objectContaining({ action: "task.message" }),
    ]);
  });

  it("records task.started for the opening message of a run seen fresh", async () => {
    const store = makeStore();
    const client = makeClient({
      searchEvents: vi.fn().mockResolvedValue({
        items: [
          {
            id: "evt-user-1",
            timestamp: "2026-01-15T00:00:01.000Z",
            source: "user",
            llm_message: { role: "user", content: "Fix the flaky test" },
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

    expect(
      store.appendedAudit.filter((record) => record.actor === "user"),
    ).toEqual([
      expect.objectContaining({
        action: "task.started",
        summary: "Run started in ws",
      }),
    ]);
    expect(store.upsertRun).toHaveBeenCalledWith(
      expect.objectContaining({ startedAt: "2026-01-15T00:00:00.000Z" }),
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

  it("closes out a run first seen already finished: end time and task.completed after its tool calls", async () => {
    // Regression: a run the collector could not discover while it ran (every
    // poll blocked behind its long commands) surfaced only after it finished,
    // with task.started and its tool.called rows but no task.completed and no
    // endedAt — createRun seeded "finished" so applyStatus saw no change.
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

    expect(store.upsertRun.mock.calls.at(-1)?.[0]).toMatchObject({
      status: "finished",
      phase: "completed",
      toolCallCount: 1,
      // The runtime's own last-touched time, not when the collector looked.
      endedAt: "2026-09-14T02:00:00.000Z",
    });
    const actions = store.appendedAudit.map((record) => record.action);
    expect(actions.indexOf("task.completed")).toBeGreaterThan(
      actions.indexOf("tool.called"),
    );
    expect(
      store.appendedAudit.find((record) => record.action === "task.completed"),
    ).toMatchObject({
      summary: "Run completed after 1 tool calls",
      at: "2026-09-14T02:00:00.000Z",
    });

    // Closing out happens once; later ticks add nothing.
    const auditAfterFirst = store.appendedAudit.length;
    await collector.tick();
    await collector.tick();
    expect(store.appendedAudit).toHaveLength(auditAfterFirst);
  });

  it("closes out a run first seen in an error state with task.failed", async () => {
    const store = persistentStore();
    const client = makeClient({
      searchConversations: vi.fn().mockResolvedValue({
        items: [{ ...finishedConversation, execution_status: "error" }],
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
      status: "error",
      endedAt: "2026-09-14T02:00:00.000Z",
    });
    expect(
      store.appendedAudit.filter((record) => record.action === "task.failed"),
    ).toHaveLength(1);
  });

  it("does not close out again a stored run that had already ended", async () => {
    const store = persistentStore();
    const client = makeClient({
      searchConversations: vi
        .fn()
        .mockResolvedValue({ items: [finishedConversation] }),
      searchEvents: searchEventsFake(),
    });
    const first = new Collector({
      client,
      store,
      now: () => "2026-09-14T02:00:05.000Z",
    });
    await first.tick();
    const completions = () =>
      store.appendedAudit.filter(
        (record) => record.action === "task.completed",
      );
    expect(completions()).toHaveLength(1);

    // A restarted collector finds the run in the store, already closed out.
    const restarted = new Collector({
      client,
      store,
      now: () => "2026-09-14T02:01:05.000Z",
    });
    await restarted.tick();
    expect(completions()).toHaveLength(1);
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

describe("Collector live event stream", () => {
  // Regression: the agent-server's `events/search` does not serve an
  // ActionEvent (nor the LLM completion before it) while it is blocked inside
  // that tool call, so a REST-only collector reported "0 tool calls / no
  // spans" for the whole duration of a `sleep 150`. The events websocket does
  // deliver it immediately; the collector must surface it from there.
  const actionEvent = {
    id: "evt-action",
    timestamp: "2026-09-14T14:02:35.419000",
    source: "agent",
    tool_name: "terminal",
    tool_call_id: "call-1",
    action: { kind: "TerminalAction", command: "sleep 150" },
  };
  const observationEvent = {
    id: "evt-observation",
    timestamp: "2026-09-14T14:05:06.114000",
    source: "environment",
    action_id: "evt-action",
    tool_name: "terminal",
    tool_call_id: "call-1",
    observation: { kind: "TerminalObservation", is_error: false },
  };

  function makeStreamingClient(overrides: Record<string, unknown> = {}) {
    const streams: Array<{
      conversationId: string;
      options: { since: string | null; onEvent: (event: unknown) => void };
      handle: { closed: boolean; close: ReturnType<typeof vi.fn> };
    }> = [];
    const openEventStream = vi.fn(
      (
        conversationId: string,
        options: { since: string | null; onEvent: (event: unknown) => void },
      ) => {
        const handle = { closed: false, close: vi.fn() };
        handle.close.mockImplementation(() => {
          handle.closed = true;
        });
        streams.push({ conversationId, options, handle });
        return handle;
      },
    );
    const client = makeClient({ openEventStream, ...overrides });
    return { client, openEventStream, streams };
  }

  it("serves an executing tool span from the websocket before the REST tail has it", async () => {
    const store = makeStore();
    const { client, openEventStream, streams } = makeStreamingClient();
    const collector = new Collector({
      client,
      store,
      now: () => "2026-09-14T14:02:36.000Z",
    });

    // Tick 1: the run is active, so the collector subscribes.
    await collector.tick();
    expect(openEventStream).toHaveBeenCalledTimes(1);
    expect(streams[0].conversationId).toBe("run-1");
    expect(streams[0].options.since).toBeNull();

    // The runtime pushes the ActionEvent the moment the command starts; the
    // REST search still returns nothing.
    streams[0].options.onEvent(actionEvent);
    await collector.tick();

    expect(store.upsertRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        toolCallCount: 1,
        phase: "tool_call",
        // The REST cursor is untouched: the tail stays the durable record.
        lastEventTimestamp: null,
      }),
    );
    expect(store.appendSpans).toHaveBeenLastCalledWith("run-1", [
      expect.objectContaining({
        spanId: "run-1:evt-action",
        name: "terminal",
        status: "executing",
        endTime: null,
      }),
    ]);
    expect(
      store.appendedAudit.filter((record) => record.action === "tool.called"),
    ).toHaveLength(1);

    // Minutes later the observation lands and the REST tail finally serves
    // both events: the call is not counted twice, and the span closes.
    streams[0].options.onEvent(observationEvent);
    client.searchEvents.mockResolvedValueOnce({
      items: [actionEvent, observationEvent],
    });
    await collector.tick();

    expect(store.upsertRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        toolCallCount: 1,
        lastEventTimestamp: observationEvent.timestamp,
      }),
    );
    expect(store.appendSpans).toHaveBeenLastCalledWith("run-1", [
      expect.objectContaining({
        spanId: "run-1:evt-action",
        status: "succeeded",
        endTime: "2026-09-14T14:05:06.114000Z",
      }),
    ]);
    expect(
      store.appendedAudit.filter((record) => record.action === "tool.called"),
    ).toHaveLength(1);
    // Still subscribed: one socket for the life of the run, not one per tick.
    expect(openEventStream).toHaveBeenCalledTimes(1);
  });

  it("closes the stream once the run is over and drops it with the tracker", async () => {
    const store = makeStore();
    const { client, openEventStream, streams } = makeStreamingClient();
    const collector = new Collector({
      client,
      store,
      now: () => "2026-09-14T14:02:36.000Z",
    });

    await collector.tick();
    expect(streams).toHaveLength(1);

    client.searchConversations.mockResolvedValue({
      items: [
        {
          id: "run-1",
          title: "Fix the flaky test",
          execution_status: "finished",
          workspace: { working_dir: "ws" },
          updated_at: "2026-09-14T14:05:10.000Z",
          created_at: "2026-09-14T14:02:00.000Z",
        },
      ],
    });
    await collector.tick();
    expect(streams[0].handle.close).toHaveBeenCalledTimes(1);

    // A finished run gets no new socket on later ticks.
    await collector.tick();
    expect(openEventStream).toHaveBeenCalledTimes(1);
  });

  it("re-opens a dropped socket from the REST cursor", async () => {
    const store = makeStore();
    const { client, openEventStream, streams } = makeStreamingClient({
      searchEvents: vi.fn().mockResolvedValue({ items: [actionEvent] }),
    });
    const collector = new Collector({
      client,
      store,
      now: () => "2026-09-14T14:02:36.000Z",
    });

    await collector.tick();
    streams[0].handle.closed = true;
    // First tick after the drop schedules the retry; back-off elapses.
    await collector.tick();
    await new Promise((resolve) => setTimeout(resolve, 2100));
    await collector.tick();

    expect(openEventStream).toHaveBeenCalledTimes(2);
    expect(streams[1].options.since).toBe(actionEvent.timestamp);
  });

  it("keeps polling-only behaviour when the client has no event stream", async () => {
    const store = makeStore();
    const client = makeClient({
      searchEvents: vi.fn().mockResolvedValue({ items: [actionEvent] }),
    });
    const collector = new Collector({
      client,
      store,
      now: () => "2026-09-14T14:02:36.000Z",
    });

    await collector.tick();

    expect(store.upsertRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ toolCallCount: 1 }),
    );
  });

  it("seeds a restarted collector's open tool spans from the store", async () => {
    // A tool span reaches the store from the socket before the REST tail
    // moves the cursor past its ActionEvent. A collector restarted in that
    // window (every deploy) must neither re-count the call when the tail
    // replays it nor lose the observation that closes it.
    const executingSpan = {
      spanId: "run-1:evt-action",
      parentSpanId: null,
      traceId: "run-1",
      kind: "tool",
      name: "terminal",
      phase: "tool_call",
      startTime: "2026-09-14T14:02:35.419000Z",
      endTime: null,
      status: "executing",
      attributes: { "tool.id": "call-1", "tool.name": "terminal" },
    };
    const store = makeStore({
      getRun: vi.fn().mockResolvedValue({
        runId: "run-1",
        workspaceId: "ws",
        agentName: "agent",
        task: "Fix the flaky test",
        status: "running",
        model: null,
        phase: "tool_call",
        startedAt: "2026-09-14T14:02:00.000Z",
        endedAt: null,
        updatedAt: "2026-09-14T14:02:36.000Z",
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
        toolCallCount: 1,
        llmCallCount: 0,
        errorCount: 0,
        artifacts: [],
        lastEventId: "evt-action",
        lastEventTimestamp: null,
        lastEventIds: [],
      }),
      listSpans: vi.fn().mockResolvedValue([executingSpan]),
    });
    const { client } = makeStreamingClient({
      searchEvents: vi.fn().mockResolvedValue({
        items: [actionEvent, observationEvent],
      }),
    });
    const collector = new Collector({
      client,
      store,
      now: () => "2026-09-14T14:05:07.000Z",
    });

    await collector.tick();

    expect(store.listSpans).toHaveBeenCalledWith("run-1");
    expect(store.upsertRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ toolCallCount: 1 }),
    );
    expect(store.appendSpans).toHaveBeenLastCalledWith("run-1", [
      expect.objectContaining({
        spanId: "run-1:evt-action",
        status: "succeeded",
      }),
    ]);
    expect(
      store.appendedAudit.filter((record) => record.action === "tool.called"),
    ).toHaveLength(0);
  });

  // Regression (production, 2026-09-14): the socket was open, the ActionEvent
  // was delivered, and the span still only appeared once the command had
  // finished. While the runtime is inside a tool call it holds the state lock,
  // so `conversations/search` blocks for the whole command and the client
  // aborts it after 30 s — every poll failed, and the events the socket had
  // queued were only ever written by a poll. They must reach the store on
  // arrival, with no REST call in the way.
  it("persists a tool call from the websocket while every poll is blocked behind it", async () => {
    const store = makeStore();
    const { client, streams } = makeStreamingClient();
    const collector = new Collector({
      client,
      store,
      logger: { ...console, info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      now: () => "2026-09-14T15:09:06.000Z",
    });

    await collector.tick();
    expect(streams).toHaveLength(1);
    store.appendSpans.mockClear();
    store.upsertRun.mockClear();

    // From here on the runtime is blocked in the tool: the search hangs and
    // the client's timeout turns it into a failed poll.
    client.searchConversations.mockRejectedValue(
      new Error("This operation was aborted"),
    );
    client.searchEvents.mockRejectedValue(
      new Error("This operation was aborted"),
    );

    streams[0].options.onEvent(actionEvent);
    await vi.waitFor(() => expect(store.upsertRun).toHaveBeenCalled());

    expect(store.appendSpans).toHaveBeenCalledTimes(1);
    expect(store.appendSpans).toHaveBeenLastCalledWith("run-1", [
      expect.objectContaining({
        spanId: "run-1:evt-action",
        name: "terminal",
        status: "executing",
        endTime: null,
      }),
    ]);
    expect(store.upsertRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        runId: "run-1",
        toolCallCount: 1,
        phase: "tool_call",
        updatedAt: "2026-09-14T15:09:06.000Z",
      }),
    );
    expect(
      store.appendedAudit.filter((record) => record.action === "tool.called"),
    ).toHaveLength(1);

    // The poll keeps failing for the length of the command; that changes
    // nothing about what is already in the store.
    await expect(collector.tick()).rejects.toThrow("aborted");
    expect(store.appendSpans).toHaveBeenCalledTimes(1);

    // The observation also arrives on the socket first — and closes the span
    // without waiting for the runtime to answer a REST call again.
    streams[0].options.onEvent(observationEvent);
    await vi.waitFor(() => expect(store.appendSpans).toHaveBeenCalledTimes(2));
    expect(store.appendSpans).toHaveBeenLastCalledWith("run-1", [
      expect.objectContaining({
        spanId: "run-1:evt-action",
        status: "succeeded",
        endTime: "2026-09-14T14:05:06.114000Z",
      }),
    ]);
    expect(store.upsertRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ toolCallCount: 1 }),
    );

    // Once the runtime answers again the tail replays both events: nothing is
    // counted twice, and the cursor finally moves.
    client.searchConversations.mockResolvedValue({
      items: [
        {
          id: "run-1",
          title: "Fix the flaky test",
          execution_status: "running",
          workspace: { working_dir: "ws" },
          updated_at: "2026-09-14T15:11:36.000Z",
          created_at: "2026-09-14T15:08:34.000Z",
        },
      ],
    });
    client.searchEvents.mockResolvedValue({ items: [] });
    client.searchEvents.mockResolvedValueOnce({
      items: [actionEvent, observationEvent],
    });
    await collector.tick();
    expect(store.appendSpans).toHaveBeenCalledTimes(2);
    expect(store.upsertRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        toolCallCount: 1,
        lastEventTimestamp: observationEvent.timestamp,
      }),
    );
    expect(
      store.appendedAudit.filter((record) => record.action === "tool.called"),
    ).toHaveLength(1);
  });

  it("halts an over-budget run on the socket's live cost report while the poll is blocked behind a long tool call", async () => {
    // Regression: run.costUsd was set only from conversations/search, which
    // hangs under the conversation lock for the length of every tool call,
    // so six back-to-back `sleep 40` commands ran to completion at seven
    // times a $0.01 budget with no budget.exceeded, no run.paused and no
    // approval. The runtime reports each completion's cost on the socket.
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
    const { client, streams } = makeStreamingClient();
    const collector = new Collector({
      client,
      store,
      logger: { ...console, info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      now: () => "2026-09-14T17:52:11.000Z",
    });

    await collector.tick();
    expect(streams).toHaveLength(1);
    expect(client.interruptConversation).not.toHaveBeenCalled();

    // The agent starts a 40 s command: from here the search hangs and every
    // poll is aborted until it returns.
    client.searchConversations.mockRejectedValue(
      new Error("This operation was aborted"),
    );
    client.searchEvents.mockRejectedValue(
      new Error("This operation was aborted"),
    );
    streams[0].options.onEvent(actionEvent);
    await vi.waitFor(() => expect(store.upsertRun).toHaveBeenCalled());
    await expect(collector.tick()).rejects.toThrow("aborted");

    // The completion that issued the command is reported live on the socket
    // — and it already costs more than the whole run is allowed.
    streams[0].options.onEvent({
      id: "evt-stats-1",
      kind: "ConversationStateUpdateEvent",
      key: "stats",
      value: {
        usage_to_metrics: {
          default: {
            model_name: "claude-opus-5",
            accumulated_cost: 0.0331,
            max_budget_per_task: null,
            accumulated_token_usage: {},
            costs: [
              { model: "claude-opus-5", cost: 0.0331, timestamp: 1789408331 },
            ],
            response_latencies: [],
            token_usages: [
              {
                model: "claude-opus-5",
                prompt_tokens: 900,
                completion_tokens: 40,
                response_id: "resp-1",
              },
            ],
          },
        },
      },
      timestamp: "2026-09-14T17:52:11.000000",
      source: "environment",
    });

    await vi.waitFor(() =>
      expect(client.interruptConversation).toHaveBeenCalledWith("run-1"),
    );
    expect(store.upsertRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ runId: "run-1", costUsd: 0.0331 }),
    );
    expect(store.appendSpans).toHaveBeenLastCalledWith("run-1", [
      expect.objectContaining({ spanId: "run-1:llm:default:0", kind: "llm" }),
    ]);
    expect(store.appendedAudit.map((record) => record.action)).toEqual(
      expect.arrayContaining(["budget.exceeded", "run.paused"]),
    );
    expect(store.upsertApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "budget",
        runId: "run-1",
        state: "pending",
      }),
    );
    // All of it before the tool returned: no poll has answered since the
    // one that was aborted, so the cost could only have come from the socket.
    expect(client.searchConversations).toHaveBeenCalledTimes(2);
  });

  it("writes socket events before the REST tail can fail the poll", async () => {
    const store = makeStore();
    const { client, streams } = makeStreamingClient();
    const collector = new Collector({
      client,
      store,
      now: () => "2026-09-14T15:09:06.000Z",
    });

    await collector.tick();
    store.appendSpans.mockClear();
    client.searchEvents.mockRejectedValueOnce(
      new Error("This operation was aborted"),
    );

    // No yield between the push and the poll: the poll itself must flush the
    // event before it asks the tail, and the tail's failure must not lose it.
    streams[0].options.onEvent(actionEvent);
    await expect(collector.tick()).rejects.toThrow("aborted");

    expect(store.appendSpans).toHaveBeenCalledTimes(1);
    expect(store.appendSpans).toHaveBeenLastCalledWith("run-1", [
      expect.objectContaining({
        spanId: "run-1:evt-action",
        status: "executing",
      }),
    ]);
    expect(store.upsertRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ toolCallCount: 1, phase: "tool_call" }),
    );
  });

  it("queues the poll behind an in-flight socket flush for the same run", async () => {
    const store = makeStore();
    let releaseFlush: () => void = () => {};
    store.appendSpans.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseFlush = resolve;
        }),
    );
    const { client, streams } = makeStreamingClient();
    const collector = new Collector({
      client,
      store,
      now: () => "2026-09-14T15:09:06.000Z",
    });

    await collector.tick();
    client.searchEvents.mockClear();

    streams[0].options.onEvent(actionEvent);
    // Let the flush start and park on its store write.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const poll = collector.tick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The poll has listed conversations but has not touched this run yet.
    expect(client.searchEvents).not.toHaveBeenCalled();

    releaseFlush();
    await poll;
    expect(client.searchEvents).toHaveBeenCalledTimes(1);
    // One executing span, written once — the poll's tail found nothing new.
    expect(
      store.appendSpans.mock.calls.filter(([, spans]) =>
        (spans as Array<{ spanId: string }>).some(
          (span) => span.spanId === "run-1:evt-action",
        ),
      ),
    ).toHaveLength(1);
  });

  it("lets the discovery search wait for the runtime's state lock instead of the 30 s default", async () => {
    // Regression: with back-to-back 40 s commands every poll straddled a
    // step, the 30 s abort fired each time, and the run was never tracked
    // (no socket, no live cost, no budget halt) until it had finished.
    const client = makeClient();
    const collector = new Collector({ client, store: makeStore() });

    await collector.tick();

    expect(client.searchConversations).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 5 * 60 * 1000 }),
    );
  });

  it("reports live sockets and socket traffic in its health", async () => {
    const store = makeStore();
    const { client, streams } = makeStreamingClient();
    const collector = new Collector({
      client,
      store,
      logger: { ...console, info: vi.fn(), warn: vi.fn() },
      now: () => "2026-09-14T15:09:06.000Z",
    });

    expect(collector.health()).toMatchObject({
      liveStreams: 0,
      liveEventsReceived: 0,
      lastLiveEventAt: null,
    });

    await collector.tick();
    expect(collector.health()).toMatchObject({ liveStreams: 1 });

    streams[0].options.onEvent(actionEvent);
    await vi.waitFor(() => expect(store.upsertRun).toHaveBeenCalledTimes(2));
    expect(collector.health()).toMatchObject({
      liveStreams: 1,
      liveEventsReceived: 1,
      lastLiveEventAt: "2026-09-14T15:09:06.000Z",
    });

    streams[0].handle.closed = true;
    expect(collector.health()).toMatchObject({ liveStreams: 0 });
  });
});
