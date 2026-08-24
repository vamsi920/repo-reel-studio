/**
 * Supabase-backed store for the AgentOps Control Tower.
 *
 * This is the **primary** store — real, durable, queryable Postgres, not local
 * files. It's used automatically whenever `SUPABASE_URL` and
 * `SUPABASE_SERVICE_ROLE_KEY` are set (see the store selection in
 * `scripts/agentops-server.mjs`); `store.mjs`'s JSONL store remains the
 * zero-setup local fallback for anyone who hasn't configured Supabase.
 *
 * The collector authenticates with the **service role key** — it is a
 * trusted backend process, not a signed-in end user, and the project's RLS
 * policies (see the `rls_agentops` migration) are written for a future
 * per-user, Supabase-Auth-backed access path that doesn't exist yet. The
 * service role bypasses RLS by design; this store performs no policy checks
 * of its own.
 *
 * Every method has the exact same async signature as `store.mjs`'s
 * `AgentOpsStore`, so `scripts/agentops-server.mjs` and `collector.mjs` are
 * written once against that shared interface and don't know which backend is
 * live.
 *
 * ## Workspace identity
 *
 * `workspaces.id` is a shared join key with the rest of the Neo data
 * platform (`src/lib/data-platform/repositories/workspace-repository.ts`),
 * which requires it to always be `computeWorkspaceId(backendId, path)` — a
 * deterministic hash, "never a fresh uuid" (that file's own words) and never
 * a raw path. Using anything else would create a second, unlinked
 * `workspaces` row for the same real folder, invisible to every other
 * workspace-scoped query and RLS policy in the schema. `workspace-id.mjs` is
 * a byte-for-byte port of the browser's own implementation
 * (`src/lib/workspace-memory/workspace-id.ts`), verified against it directly
 * in `__tests__/scripts/agentops-workspace-id.test.ts`.
 *
 * The raw, human-readable path is not lost — it's kept in `workspaces.path`
 * (and `.name`), and reads join back to it (`#embedWorkspacePath` below) so
 * the REST API and UI keep seeing a real folder name, not an opaque hash,
 * exactly like the JSONL fallback store does.
 *
 * ## Org bootstrap
 *
 * `workspaces.org_id` is NOT NULL, FKing to `orgs.id`. The rest of the
 * platform gives every signed-in browser its own real "Personal" org via
 * Supabase Auth (`src/lib/data-platform/repositories/repository-identity.ts`)
 * — a per-user org, not a single shared one. This collector has no browser
 * session and therefore no way to know which user's org a given run belongs
 * to, so it bootstraps a single fixed **default org** (`DEFAULT_ORG_ID`
 * below) instead. This is a known, temporary gap, not a design choice to
 * build further on: it means AgentOps workspace rows won't be visible to a
 * real per-user org's membership-gated queries until the collector learns
 * which org to write into (tracked as follow-up work, not done in this
 * pass — the org's the async remaining piece; the workspace id itself is
 * now correct).
 */

import { createClient } from "@supabase/supabase-js";
import { DEFAULT_POLICY } from "./store.mjs";
import { computeWorkspaceId, DEFAULT_BACKEND_ID } from "./workspace-id.mjs";

/**
 * Deterministic, fixed id for the single bootstrap org every local Neo
 * install shares today. Not a real tenant — see the module docstring.
 */
export const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";
const DEFAULT_ORG_NAME = "Neo (local)";

function isConfigured(env = process.env) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

// ── Row <-> JS mappers ──────────────────────────────────────────────────────
// Pure functions, exported for unit testing without a network call. Column
// names are the wire contract (see the `agentops` and `rls_agentops`
// migrations); JS field names match what map-events.mjs and policy.mjs
// already produce.

/**
 * `workspaceDbId` is the already-resolved `computeWorkspaceId()` hash (or
 * `null` for a run with no known workspace) — never derived from
 * `run.workspaceId` here, since that field is the raw path. Same pattern as
 * `spanToRow(span, runId)` below: the caller resolves identity, the mapper
 * stays a pure function of its inputs.
 */
export function runToRow(run, workspaceDbId) {
  return {
    run_id: run.runId,
    workspace_id: workspaceDbId,
    agent_name: run.agentName,
    task: run.task,
    status: run.status,
    model: run.model,
    phase: run.phase,
    started_at: run.startedAt,
    ended_at: run.endedAt,
    updated_at: run.updatedAt,
    cost_usd: run.costUsd,
    max_budget_per_task: run.maxBudgetPerTask,
    tokens: run.tokens,
    tool_call_count: run.toolCallCount,
    llm_call_count: run.llmCallCount,
    error_count: run.errorCount,
    artifacts: run.artifacts,
  };
}

/**
 * Prefers the embedded `workspaces.path` (see `#embedWorkspace` below) over
 * the raw `workspace_id` column so callers keep seeing a real folder path —
 * the DB column itself is a hash, an implementation detail of the FK, never
 * meant to reach the REST API or UI.
 */
export function rowToRun(row) {
  if (!row) return null;
  return {
    runId: row.run_id,
    workspaceId: row.workspaces?.path ?? row.workspace_id ?? "unknown",
    agentName: row.agent_name,
    task: row.task,
    status: row.status,
    model: row.model,
    phase: row.phase,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    updatedAt: row.updated_at,
    costUsd: Number(row.cost_usd ?? 0),
    maxBudgetPerTask:
      row.max_budget_per_task === null ? null : Number(row.max_budget_per_task),
    tokens: row.tokens ?? {},
    toolCallCount: row.tool_call_count ?? 0,
    llmCallCount: row.llm_call_count ?? 0,
    errorCount: row.error_count ?? 0,
    artifacts: row.artifacts ?? [],
    // Cursor bookkeeping (see map-events.mjs / collector.mjs) is
    // Postgres-store-agnostic and travels inside `tokens`-adjacent run state
    // only in memory; a restarted collector re-derives it by re-tailing from
    // `updated_at`, so it is intentionally not persisted as its own column.
    lastEventTimestamp: null,
    lastEventIds: [],
  };
}

/**
 * `runId` is taken as an explicit parameter (not read off `span.traceId`)
 * because `run_id` and `trace_id` are deliberately separate columns in the
 * schema — today `RunAggregator` always sets `traceId === runId` (no
 * distributed tracing), but the row mapper shouldn't depend on that staying
 * true.
 */
export function spanToRow(span, runId) {
  return {
    span_id: span.spanId,
    run_id: runId,
    parent_span_id: span.parentSpanId,
    trace_id: span.traceId,
    kind: span.kind,
    name: span.name,
    phase: span.phase,
    status: span.status,
    start_time: span.startTime,
    end_time: span.endTime,
    attributes: span.attributes ?? {},
  };
}

export function rowToSpan(row) {
  return {
    spanId: row.span_id,
    parentSpanId: row.parent_span_id,
    traceId: row.trace_id,
    kind: row.kind,
    name: row.name,
    phase: row.phase,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    attributes: row.attributes ?? {},
  };
}

/** `workspaceDbId` — see the note on `runToRow`. */
export function auditToRow(record, workspaceDbId) {
  return {
    id: record.id,
    at: record.at,
    actor: record.actor,
    action: record.action,
    summary: record.summary,
    entity_type: record.entityType,
    entity_id: record.entityId,
    workspace_id: workspaceDbId,
    metadata: record.metadata ?? {},
  };
}

export function rowToAudit(row) {
  return {
    id: row.id,
    at: row.at,
    actor: row.actor,
    action: row.action,
    summary: row.summary,
    entityType: row.entity_type,
    entityId: row.entity_id,
    workspaceId: row.workspaces?.path ?? row.workspace_id ?? undefined,
    metadata: row.metadata ?? {},
  };
}

/** `workspaceDbId` — see the note on `runToRow`. */
export function approvalToRow(approval, workspaceDbId) {
  return {
    id: approval.id,
    kind: approval.kind,
    state: approval.state,
    run_id: approval.runId,
    workspace_id: workspaceDbId,
    agent_name: approval.agentName,
    title: approval.title,
    what: approval.what ?? null,
    why: approval.why,
    tool_name: approval.toolName ?? null,
    security_risk: approval.securityRisk ?? null,
    artifacts: approval.artifacts ?? [],
    estimated_cost_usd: approval.estimatedCostUsd,
    autonomy_level: approval.autonomyLevel ?? null,
    breaches: approval.breaches ?? [],
    requested_at: approval.requestedAt,
    decided_at: approval.decidedAt ?? null,
    decision_reason: approval.decisionReason ?? null,
  };
}

export function rowToApproval(row) {
  return {
    id: row.id,
    kind: row.kind,
    state: row.state,
    runId: row.run_id,
    workspaceId: row.workspaces?.path ?? row.workspace_id,
    agentName: row.agent_name,
    title: row.title,
    what: row.what,
    why: row.why,
    toolName: row.tool_name,
    securityRisk: row.security_risk,
    artifacts: row.artifacts ?? [],
    estimatedCostUsd:
      row.estimated_cost_usd === null ? null : Number(row.estimated_cost_usd),
    autonomyLevel: row.autonomy_level,
    breaches: row.breaches ?? [],
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    decisionReason: row.decision_reason,
  };
}

export class SupabaseAgentOpsStore {
  constructor({ url, serviceRoleKey } = {}) {
    const resolvedUrl = url ?? process.env.SUPABASE_URL;
    const resolvedKey = serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!resolvedUrl || !resolvedKey) {
      throw new Error(
        "SupabaseAgentOpsStore requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
      );
    }
    this.client = createClient(resolvedUrl, resolvedKey, {
      auth: { persistSession: false },
    });
    /**
     * Raw workspaceId (agent-server working_dir) → resolved
     * `computeWorkspaceId()` hash, once its bootstrap upsert has succeeded
     * this process lifetime. Doubles as the memoized resolver so repeated
     * writes for the same workspace don't re-upsert every time.
     */
    this.workspaceDbIds = new Map();
    this.orgBootstrapped = false;
  }

  async #ensureOrg() {
    if (this.orgBootstrapped) return;
    const { error } = await this.client
      .from("orgs")
      .upsert(
        { id: DEFAULT_ORG_ID, name: DEFAULT_ORG_NAME },
        { onConflict: "id", ignoreDuplicates: true },
      );
    if (error)
      throw new Error(`Failed to bootstrap default org: ${error.message}`);
    this.orgBootstrapped = true;
  }

  /**
   * Resolves a raw workspace path to the shared `computeWorkspaceId()` hash,
   * upserting the `workspaces` row (keyed by that hash, `path` holding the
   * original raw value) the first time this process sees it. Returns `null`
   * for an unknown/empty workspace — callers pass that straight through as
   * `workspace_id: null`, which the schema allows.
   */
  async #ensureWorkspace(workspaceId) {
    if (!workspaceId || workspaceId === "unknown") return null;

    const cached = this.workspaceDbIds.get(workspaceId);
    if (cached) return cached;

    const dbId = computeWorkspaceId(DEFAULT_BACKEND_ID, workspaceId);
    if (!dbId) return null;
    await this.#ensureOrg();

    const parts = workspaceId.split("/").filter(Boolean);
    const { error } = await this.client.from("workspaces").upsert(
      {
        id: dbId,
        org_id: DEFAULT_ORG_ID,
        backend_id: DEFAULT_BACKEND_ID,
        path: workspaceId,
        name: parts[parts.length - 1] ?? workspaceId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) {
      throw new Error(
        `Failed to bootstrap workspace "${workspaceId}": ${error.message}`,
      );
    }
    this.workspaceDbIds.set(workspaceId, dbId);
    return dbId;
  }

  // ── Runs ──────────────────────────────────────────────────────────────

  async upsertRun(run) {
    const workspaceDbId = await this.#ensureWorkspace(run.workspaceId);
    const { error } = await this.client
      .from("agentops_runs")
      .upsert(runToRow(run, workspaceDbId), { onConflict: "run_id" });
    if (error) throw new Error(`upsertRun failed: ${error.message}`);
    return run;
  }

  async getRun(runId) {
    const { data, error } = await this.client
      .from("agentops_runs")
      .select("*, workspaces(path, name)")
      .eq("run_id", runId)
      .maybeSingle();
    if (error) throw new Error(`getRun failed: ${error.message}`);
    return rowToRun(data);
  }

  /**
   * `workspaceId` here is the DB hash (`computeWorkspaceId()` output), not
   * the raw path — it's compared directly against the `workspace_id` column.
   * No current caller passes it (the REST layer plumbs the param through
   * defensively for future workspace-scoped filtering UI); documenting the
   * contract now so whoever wires that UI doesn't pass a raw path by mistake.
   */
  async listRuns({ status, workspaceId, since, limit = 200 } = {}) {
    let query = this.client
      .from("agentops_runs")
      .select("*, workspaces(path, name)")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (status) query = query.in("status", String(status).split(","));
    if (workspaceId) query = query.eq("workspace_id", workspaceId);
    if (since) query = query.gte("updated_at", since);

    const { data, error } = await query;
    if (error) throw new Error(`listRuns failed: ${error.message}`);
    return (data ?? []).map(rowToRun);
  }

  // ── Spans ─────────────────────────────────────────────────────────────

  async appendSpans(runId, spans) {
    if (!spans.length) return;
    const { error } = await this.client.from("agentops_spans").upsert(
      spans.map((span) => spanToRow(span, runId)),
      { onConflict: "span_id" },
    );
    if (error) throw new Error(`appendSpans failed: ${error.message}`);
  }

  async listSpans(runId) {
    const { data, error } = await this.client
      .from("agentops_spans")
      .select("*")
      .eq("run_id", runId)
      .order("start_time", { ascending: true });
    if (error) throw new Error(`listSpans failed: ${error.message}`);
    return (data ?? []).map(rowToSpan);
  }

  // ── Audit ─────────────────────────────────────────────────────────────

  async appendAudit(record) {
    const workspaceDbId = await this.#ensureWorkspace(record.workspaceId);
    const entry = { id: crypto.randomUUID(), ...record };
    const { error } = await this.client
      .from("agentops_audit")
      .insert(auditToRow(entry, workspaceDbId));
    if (error) throw new Error(`appendAudit failed: ${error.message}`);
    return entry;
  }

  /** `workspaceId` filter contract — see the note on `listRuns`. */
  async listAudit({ entityId, workspaceId, since, limit = 500 } = {}) {
    let query = this.client
      .from("agentops_audit")
      .select("*, workspaces(path, name)")
      .order("at", { ascending: false })
      .limit(limit);
    if (entityId) query = query.eq("entity_id", entityId);
    if (workspaceId) query = query.eq("workspace_id", workspaceId);
    if (since) query = query.gte("at", since);

    const { data, error } = await query;
    if (error) throw new Error(`listAudit failed: ${error.message}`);
    return (data ?? []).map(rowToAudit);
  }

  // ── Approvals ─────────────────────────────────────────────────────────

  async upsertApproval(approval) {
    const workspaceDbId = await this.#ensureWorkspace(approval.workspaceId);
    const { error } = await this.client
      .from("agentops_approvals")
      .upsert(approvalToRow(approval, workspaceDbId), { onConflict: "id" });
    if (error) throw new Error(`upsertApproval failed: ${error.message}`);
    return approval;
  }

  async getApproval(id) {
    const { data, error } = await this.client
      .from("agentops_approvals")
      .select("*, workspaces(path, name)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`getApproval failed: ${error.message}`);
    return data ? rowToApproval(data) : null;
  }

  async listApprovals({ state = "pending" } = {}) {
    let query = this.client
      .from("agentops_approvals")
      .select("*, workspaces(path, name)")
      .order("requested_at", { ascending: false });
    if (state !== "all") query = query.eq("state", state);

    const { data, error } = await query;
    if (error) throw new Error(`listApprovals failed: ${error.message}`);
    return (data ?? []).map(rowToApproval);
  }

  // ── Policies ──────────────────────────────────────────────────────────

  async getWorkspacePolicy(workspaceId) {
    const workspaceDbId = await this.#ensureWorkspace(workspaceId);
    if (!workspaceDbId) return { ...DEFAULT_POLICY, workspaceId };

    const { data, error } = await this.client
      .from("agentops_policies")
      .select("policy")
      .eq("workspace_id", workspaceDbId)
      .maybeSingle();
    if (error) throw new Error(`getWorkspacePolicy failed: ${error.message}`);
    return { ...DEFAULT_POLICY, ...(data?.policy ?? {}), workspaceId };
  }

  async getAgentBudget(agentName) {
    await this.#ensureOrg();
    const { data, error } = await this.client
      .from("agentops_agent_budgets")
      .select("agent_budget_usd")
      .eq("org_id", DEFAULT_ORG_ID)
      .eq("agent_name", agentName)
      .maybeSingle();
    if (error) throw new Error(`getAgentBudget failed: ${error.message}`);
    const value = data?.agent_budget_usd;
    return typeof value === "number"
      ? value
      : value === null
        ? null
        : Number(value);
  }

  /**
   * Both maps are keyed by the raw workspace path / agent name — the public
   * contract every caller (collector, REST layer, JSONL fallback store)
   * shares — never by the internal DB hash.
   */
  async getPolicies() {
    const [
      { data: workspaceRows, error: workspaceError },
      { data: agentRows, error: agentError },
    ] = await Promise.all([
      this.client
        .from("agentops_policies")
        .select("workspace_id, policy, workspaces(path)"),
      this.client
        .from("agentops_agent_budgets")
        .select("agent_name, agent_budget_usd")
        .eq("org_id", DEFAULT_ORG_ID),
    ]);
    if (workspaceError)
      throw new Error(`getPolicies failed: ${workspaceError.message}`);
    if (agentError)
      throw new Error(`getPolicies failed: ${agentError.message}`);

    const workspaces = {};
    for (const row of workspaceRows ?? []) {
      const path = row.workspaces?.path ?? row.workspace_id;
      workspaces[path] = row.policy ?? {};
    }
    const agents = {};
    for (const row of agentRows ?? []) {
      agents[row.agent_name] = { agentBudgetUsd: row.agent_budget_usd };
    }
    return { workspaces, agents };
  }

  async setPolicies(policies) {
    const workspaces = policies?.workspaces ?? {};
    const agents = policies?.agents ?? {};

    const workspaceDbIds = new Map();
    for (const workspaceId of Object.keys(workspaces)) {
      workspaceDbIds.set(workspaceId, await this.#ensureWorkspace(workspaceId));
    }
    if (Object.keys(agents).length) await this.#ensureOrg();

    const workspaceRows = Object.entries(workspaces)
      .filter(([workspaceId]) => workspaceDbIds.get(workspaceId))
      .map(([workspaceId, policy]) => ({
        workspace_id: workspaceDbIds.get(workspaceId),
        policy,
        updated_at: new Date().toISOString(),
      }));
    const agentRows = Object.entries(agents).map(([agentName, value]) => ({
      org_id: DEFAULT_ORG_ID,
      agent_name: agentName,
      agent_budget_usd: value?.agentBudgetUsd ?? null,
    }));

    if (workspaceRows.length) {
      const { error } = await this.client
        .from("agentops_policies")
        .upsert(workspaceRows, { onConflict: "workspace_id" });
      if (error) throw new Error(`setPolicies failed: ${error.message}`);
    }
    if (agentRows.length) {
      const { error } = await this.client
        .from("agentops_agent_budgets")
        .upsert(agentRows, { onConflict: "org_id,agent_name" });
      if (error) throw new Error(`setPolicies failed: ${error.message}`);
    }

    return this.getPolicies();
  }
}

export function isSupabaseConfigured(env = process.env) {
  return isConfigured(env);
}
