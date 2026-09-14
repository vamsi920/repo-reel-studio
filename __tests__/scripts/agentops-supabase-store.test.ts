import { describe, expect, it } from "vitest";

import {
  approvalToRow,
  auditToRow,
  rowToApproval,
  rowToAudit,
  rowToRun,
  rowToSpan,
  runAuditFilter,
  runToRow,
  spanToRow,
  DEFAULT_ORG_ID,
  SupabaseAgentOpsStore,
} from "../../scripts/agentops/supabase-store.mjs";

/**
 * Every write-side mapper takes the resolved `computeWorkspaceId()` hash as
 * an explicit second argument — see `#ensureWorkspace` in
 * `supabase-store.mjs`. Tests use a fixed fake hash rather than a real one;
 * the hash function itself is covered by
 * `__tests__/scripts/agentops-workspace-id.test.ts`.
 */
const FAKE_WORKSPACE_DB_ID = "ws_deadbeefcafef00d";
const RAW_WORKSPACE_PATH = "/workspace/project";

describe("run row mapping", () => {
  const run = {
    runId: "run-1",
    workspaceId: RAW_WORKSPACE_PATH,
    agentName: "OpenHands Agent",
    task: "Fix the flaky test",
    status: "running",
    model: "claude-opus-5",
    phase: "tests",
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: null,
    updatedAt: "2026-01-01T00:05:00.000Z",
    costUsd: 0.42,
    maxBudgetPerTask: 5,
    tokens: {
      prompt: 1000,
      completion: 200,
      cacheRead: 0,
      cacheWrite: 0,
      reasoning: 0,
      total: 1200,
    },
    toolCallCount: 3,
    llmCallCount: 2,
    errorCount: 0,
    artifacts: ["src/app.ts"],
  };

  it("writes the resolved hash to workspace_id, never the raw path", () => {
    const row = runToRow(run, FAKE_WORKSPACE_DB_ID);
    expect(row).toMatchObject({
      run_id: "run-1",
      workspace_id: FAKE_WORKSPACE_DB_ID,
      agent_name: "OpenHands Agent",
      cost_usd: 0.42,
      max_budget_per_task: 5,
      tool_call_count: 3,
      artifacts: ["src/app.ts"],
    });
  });

  it("passes null through when the run has no resolved workspace", () => {
    const row = runToRow(run, null);
    expect(row.workspace_id).toBeNull();
  });

  it("prefers the embedded workspaces.path over the raw hash column on read", () => {
    const row = runToRow(run, FAKE_WORKSPACE_DB_ID);
    const withEmbed = { ...row, workspaces: { path: RAW_WORKSPACE_PATH } };
    const roundTripped = rowToRun(withEmbed)!;
    expect(roundTripped.workspaceId).toBe(RAW_WORKSPACE_PATH);
    expect(roundTripped.runId).toBe(run.runId);
    expect(roundTripped.costUsd).toBe(run.costUsd);
    expect(roundTripped.tokens).toEqual(run.tokens);
    expect(roundTripped.artifacts).toEqual(run.artifacts);
  });

  it("falls back to the raw workspace_id column when no embed is present", () => {
    const row = runToRow(run, FAKE_WORKSPACE_DB_ID);
    expect(rowToRun(row)!.workspaceId).toBe(FAKE_WORKSPACE_DB_ID);
  });

  it("maps a NULL workspace column back to the 'unknown' sentinel", () => {
    const row = runToRow(run, null);
    expect(rowToRun(row)!.workspaceId).toBe("unknown");
  });

  it("returns null for a missing row rather than throwing", () => {
    expect(rowToRun(null)).toBeNull();
    expect(rowToRun(undefined)).toBeNull();
  });

  it("coerces numeric-string cost/budget columns (Postgres numeric) back to JS numbers", () => {
    const row = runToRow(run, FAKE_WORKSPACE_DB_ID);
    row.cost_usd = "0.420000";
    row.max_budget_per_task = "5.00";
    const roundTripped = rowToRun(row)!;
    expect(roundTripped.costUsd).toBe(0.42);
    expect(roundTripped.maxBudgetPerTask).toBe(5);
  });

  it("keeps max_budget_per_task null rather than coercing null to 0", () => {
    const row = runToRow(
      { ...run, maxBudgetPerTask: null },
      FAKE_WORKSPACE_DB_ID,
    );
    expect(row.max_budget_per_task).toBeNull();
    expect(rowToRun(row)!.maxBudgetPerTask).toBeNull();
  });

  it("round-trips the collector's event tail cursor so a restart resumes instead of replaying", () => {
    // Regression test: rowToRun() used to hardcode lastEventTimestamp: null
    // and lastEventIds: [] on every read, so a restarted collector always
    // re-tailed every event from the start of the conversation, duplicating
    // audit records and re-incrementing tool/llm/error counts.
    const row = runToRow(
      {
        ...run,
        lastEventTimestamp: "2026-01-01T00:04:30.000Z",
        lastEventIds: ["evt-41", "evt-42"],
      },
      FAKE_WORKSPACE_DB_ID,
    );
    expect(row.last_event_timestamp).toBe("2026-01-01T00:04:30.000Z");
    expect(row.last_event_ids).toEqual(["evt-41", "evt-42"]);

    const roundTripped = rowToRun(row)!;
    expect(roundTripped.lastEventTimestamp).toBe("2026-01-01T00:04:30.000Z");
    expect(roundTripped.lastEventIds).toEqual(["evt-41", "evt-42"]);
  });

  it("defaults an unset cursor to null/empty rather than throwing", () => {
    const row = runToRow(run, FAKE_WORKSPACE_DB_ID);
    expect(row.last_event_timestamp).toBeNull();
    expect(row.last_event_ids).toEqual([]);
    expect(rowToRun(row)!.lastEventTimestamp).toBeNull();
    expect(rowToRun(row)!.lastEventIds).toEqual([]);
  });
});

describe("span row mapping", () => {
  const span = {
    spanId: "run-1:evt-1",
    parentSpanId: null,
    traceId: "run-1",
    kind: "tool",
    name: "execute_bash",
    phase: "tests",
    startTime: "2026-01-01T00:00:01.000Z",
    endTime: "2026-01-01T00:00:05.000Z",
    status: "succeeded",
    attributes: { "tool.name": "execute_bash" },
  };

  it("takes run_id from the explicit parameter, not span.traceId", () => {
    const row = spanToRow(span, "explicit-run-id");
    expect(row.run_id).toBe("explicit-run-id");
    expect(row.trace_id).toBe("run-1");
  });

  it("round-trips a span through the DB row shape", () => {
    const row = spanToRow(span, "run-1");
    const roundTripped = rowToSpan(row);
    expect(roundTripped).toMatchObject({
      spanId: "run-1:evt-1",
      traceId: "run-1",
      kind: "tool",
      name: "execute_bash",
      status: "succeeded",
    });
    expect(roundTripped.attributes).toEqual(span.attributes);
  });
});

describe("audit row mapping", () => {
  const record = {
    id: "audit-1",
    at: "2026-01-01T00:00:00.000Z",
    actor: "agent",
    action: "tool.called",
    summary: "execute_bash (ExecuteBashAction)",
    entityType: "run",
    entityId: "run-1",
    workspaceId: "unknown",
    metadata: { toolCallId: "call-1" },
  };

  it("writes the resolved hash to workspace_id", () => {
    const row = auditToRow(record, FAKE_WORKSPACE_DB_ID);
    expect(row.workspace_id).toBe(FAKE_WORKSPACE_DB_ID);
  });

  it("passes null through when there's no resolved workspace", () => {
    expect(auditToRow(record, null).workspace_id).toBeNull();
  });

  it("prefers the embedded workspaces.path on read, falls back to the raw column", () => {
    const row = auditToRow(record, FAKE_WORKSPACE_DB_ID);

    const withEmbed = rowToAudit({
      ...row,
      workspaces: { path: RAW_WORKSPACE_PATH },
    });
    expect(withEmbed).toMatchObject({
      id: "audit-1",
      actor: "agent",
      action: "tool.called",
      entityType: "run",
      entityId: "run-1",
      workspaceId: RAW_WORKSPACE_PATH,
    });
    expect(withEmbed.metadata).toEqual(record.metadata);

    expect(rowToAudit(row).workspaceId).toBe(FAKE_WORKSPACE_DB_ID);
  });
});

describe("approval row mapping", () => {
  const approval = {
    id: "confirmation:run-1:2026-01-01T00:00:00.000Z",
    kind: "confirmation",
    state: "pending",
    runId: "run-1",
    workspaceId: RAW_WORKSPACE_PATH,
    agentName: "OpenHands Agent",
    title: "OpenHands Agent wants to run execute_bash",
    what: { command: "rm -rf build" },
    why: "The agent requested confirmation before proceeding.",
    toolName: "execute_bash",
    securityRisk: "HIGH",
    artifacts: ["src/app.ts"],
    estimatedCostUsd: 0.12,
    autonomyLevel: "supervised",
    breaches: [],
    requestedAt: "2026-01-01T00:00:00.000Z",
  };

  it("round-trips an approval through the DB row shape", () => {
    const row = approvalToRow(approval, FAKE_WORKSPACE_DB_ID);
    expect(row).toMatchObject({
      id: approval.id,
      kind: "confirmation",
      state: "pending",
      run_id: "run-1",
      workspace_id: FAKE_WORKSPACE_DB_ID,
      security_risk: "HIGH",
      autonomy_level: "supervised",
    });

    const roundTripped = rowToApproval({
      ...row,
      workspaces: { path: RAW_WORKSPACE_PATH },
    });
    expect(roundTripped.workspaceId).toBe(RAW_WORKSPACE_PATH);
    expect(roundTripped.what).toEqual(approval.what);
    expect(roundTripped.artifacts).toEqual(approval.artifacts);
    expect(roundTripped.estimatedCostUsd).toBe(approval.estimatedCostUsd);
  });

  it("coerces a numeric-string estimated_cost_usd column back to a JS number", () => {
    const row = approvalToRow(approval, FAKE_WORKSPACE_DB_ID);
    row.estimated_cost_usd = "0.120000";
    expect(rowToApproval(row).estimatedCostUsd).toBe(0.12);
  });
});

describe("bootstrap org id", () => {
  it("is a fixed, deterministic UUID", () => {
    expect(DEFAULT_ORG_ID).toBe("00000000-0000-0000-0000-000000000001");
  });
});

describe("run-scoped audit filter", () => {
  const RUN_ID = "600d2a7a-ead8-4b13-a02a-b6395a065e62";

  it("matches rows recorded against the run and rows that only name it in metadata", () => {
    expect(runAuditFilter(RUN_ID)).toBe(
      `entity_id.eq."${RUN_ID}",metadata->>runId.eq."${RUN_ID}"`,
    );
  });

  it("quotes the id so reserved PostgREST characters cannot split the filter", () => {
    expect(runAuditFilter('a,b.c"d')).toBe(
      'entity_id.eq."a,b.c\\"d",metadata->>runId.eq."a,b.c\\"d"',
    );
  });

  it("listAudit({ runId }) applies the or-filter instead of a strict entity_id match", async () => {
    const calls: Array<[string, unknown]> = [];
    const builder = {
      select() {
        calls.push(["select", undefined]);
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      eq(column: string, value: unknown) {
        calls.push(["eq", [column, value]]);
        return builder;
      },
      or(filter: string) {
        calls.push(["or", filter]);
        return builder;
      },
      gte() {
        return builder;
      },
      then(resolve: (value: unknown) => void) {
        resolve({ data: [], error: null });
      },
    };
    const store = new SupabaseAgentOpsStore({
      url: "http://localhost:54321",
      serviceRoleKey: "test-service-role-key",
    });
    store.client = { from: () => builder } as never;

    await store.listAudit({ runId: RUN_ID });

    expect(calls).toContainEqual(["or", runAuditFilter(RUN_ID)]);
    expect(calls.some(([name]) => name === "eq")).toBe(false);
  });
});
