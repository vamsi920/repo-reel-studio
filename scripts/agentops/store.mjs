/**
 * Append-only JSONL store for the AgentOps Control Tower.
 *
 * This is the **local fallback** store, used when `SUPABASE_URL`/
 * `SUPABASE_SERVICE_ROLE_KEY` are not configured (see
 * `scripts/agentops-server.mjs`'s store selection at startup). The primary
 * store is `scripts/agentops/supabase-store.mjs`, backed by the project's real
 * Postgres database. This one exists so the feature works with zero external
 * setup: dependency-free (node: builtins only), ships in the same npm package
 * and Docker image as the app.
 *
 * An append-only file is tamper-evident (rewriting history means rewriting the
 * file) and lets a support request be answered with `cat`.
 *
 * On boot the whole store is read once to rebuild an in-memory index; from then
 * on reads are served from memory and writes are appends. Policies are the one
 * exception — they are edited, not accumulated, so they live in a plain JSON
 * file that is rewritten atomically.
 *
 * Every method is `async` even though the underlying I/O is synchronous, so
 * that this store and `SupabaseAgentOpsStore` are drop-in interchangeable —
 * callers always `await`.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";

export const DEFAULT_STORE_DIR =
  process.env.AGENTOPS_STORE_DIR || join(homedir(), ".neodevex", "agentops");

function readJsonl(path) {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf-8");
  const records = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed));
    } catch {
      // A torn last line (process killed mid-append) must not make the whole
      // store unreadable. Skip it and keep going.
    }
  }
  return records;
}

function writeJsonAtomic(path, value) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  renameSync(tmp, path);
}

export const DEFAULT_POLICY = Object.freeze({
  monthlyBudgetUsd: null,
  runBudgetUsd: null,
  agentBudgetUsd: null,
  warnThresholdPct: [50, 80, 100],
  allowedTools: null,
  autonomyLevel: "assisted",
  approvalThresholds: { securityRisk: "HIGH", costUsd: null },
});

export class AgentOpsStore {
  constructor(dir = DEFAULT_STORE_DIR) {
    this.dir = dir;
    this.spansDir = join(dir, "spans");
    this.runsPath = join(dir, "runs.jsonl");
    this.auditPath = join(dir, "audit.jsonl");
    this.approvalsPath = join(dir, "approvals.jsonl");
    this.policiesPath = join(dir, "policies.json");

    mkdirSync(this.spansDir, { recursive: true });

    /** runId → latest run record. */
    this.runs = new Map();
    /** approvalId → latest approval record. */
    this.approvals = new Map();
    this.audit = [];
    this.policies = { workspaces: {}, agents: {} };

    this.#load();
  }

  #load() {
    // Later records win: both files are append-only journals of successive
    // versions of the same entity.
    for (const record of readJsonl(this.runsPath)) {
      if (record?.runId) this.runs.set(record.runId, record);
    }
    for (const record of readJsonl(this.approvalsPath)) {
      if (record?.id) this.approvals.set(record.id, record);
    }
    this.audit = readJsonl(this.auditPath);

    if (existsSync(this.policiesPath)) {
      try {
        const parsed = JSON.parse(readFileSync(this.policiesPath, "utf-8"));
        this.policies = {
          workspaces: parsed?.workspaces ?? {},
          agents: parsed?.agents ?? {},
        };
      } catch {
        // Corrupt policy file: fall back to defaults rather than refusing to
        // start. The operator sees the defaults in the Budgets tab and can
        // re-save.
      }
    }
  }

  // ── Runs ────────────────────────────────────────────────────────────────

  async upsertRun(run) {
    this.runs.set(run.runId, run);
    appendFileSync(this.runsPath, `${JSON.stringify(run)}\n`, "utf-8");
    return run;
  }

  async getRun(runId) {
    return this.runs.get(runId) ?? null;
  }

  async listRuns({ status, workspaceId, since, limit = 200 } = {}) {
    let runs = [...this.runs.values()];
    if (status) {
      const wanted = new Set(String(status).split(","));
      runs = runs.filter((run) => wanted.has(run.status));
    }
    if (workspaceId)
      runs = runs.filter((run) => run.workspaceId === workspaceId);
    if (since) {
      const cutoff = new Date(since).getTime();
      runs = runs.filter((run) => new Date(run.updatedAt).getTime() >= cutoff);
    }
    runs.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    return runs.slice(0, limit);
  }

  // ── Spans ───────────────────────────────────────────────────────────────

  #spanPath(runId) {
    // Run ids come from the agent-server (ULID/UUID); refuse anything that
    // could escape the spans directory rather than trusting that.
    if (!/^[A-Za-z0-9._-]+$/.test(runId)) {
      throw new Error(`Refusing to use unsafe run id as a filename: ${runId}`);
    }
    return join(this.spansDir, `${runId}.jsonl`);
  }

  async appendSpans(runId, spans) {
    if (!spans.length) return;
    const payload = spans.map((span) => JSON.stringify(span)).join("\n");
    appendFileSync(this.#spanPath(runId), `${payload}\n`, "utf-8");
  }

  /**
   * Spans for one run, with later versions of the same span id collapsed onto
   * the earlier one — a tool span is appended when it opens and again when it
   * closes, and the closed version is the truth.
   */
  async listSpans(runId) {
    const byId = new Map();
    for (const span of readJsonl(this.#spanPath(runId))) {
      if (!span?.spanId) continue;
      byId.set(span.spanId, span);
    }
    return [...byId.values()].sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );
  }

  // ── Audit ───────────────────────────────────────────────────────────────

  async appendAudit(record) {
    const entry = {
      id: `${record.entityId ?? "system"}:${record.action}:${record.at}:${this.audit.length}`,
      ...record,
    };
    this.audit.push(entry);
    appendFileSync(this.auditPath, `${JSON.stringify(entry)}\n`, "utf-8");
    return entry;
  }

  async listAudit({ entityId, workspaceId, since, limit = 500 } = {}) {
    let records = this.audit;
    if (entityId) records = records.filter((r) => r.entityId === entityId);
    if (workspaceId)
      records = records.filter((r) => r.workspaceId === workspaceId);
    if (since) {
      const cutoff = new Date(since).getTime();
      records = records.filter((r) => new Date(r.at).getTime() >= cutoff);
    }
    return records.slice(-limit).reverse();
  }

  // ── Approvals ───────────────────────────────────────────────────────────

  async upsertApproval(approval) {
    this.approvals.set(approval.id, approval);
    appendFileSync(
      this.approvalsPath,
      `${JSON.stringify(approval)}\n`,
      "utf-8",
    );
    return approval;
  }

  async getApproval(id) {
    return this.approvals.get(id) ?? null;
  }

  async listApprovals({ state = "pending" } = {}) {
    const approvals = [...this.approvals.values()];
    const filtered =
      state === "all" ? approvals : approvals.filter((a) => a.state === state);
    return filtered.sort(
      (a, b) =>
        new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime(),
    );
  }

  // ── Policies ────────────────────────────────────────────────────────────

  async getWorkspacePolicy(workspaceId) {
    return {
      ...DEFAULT_POLICY,
      ...(this.policies.workspaces[workspaceId] ?? {}),
      workspaceId,
    };
  }

  async getAgentBudget(agentName) {
    const value = this.policies.agents?.[agentName]?.agentBudgetUsd;
    return typeof value === "number" ? value : null;
  }

  async getPolicies() {
    return this.policies;
  }

  async setPolicies(policies) {
    this.policies = {
      workspaces: policies?.workspaces ?? {},
      agents: policies?.agents ?? {},
    };
    writeJsonAtomic(this.policiesPath, this.policies);
    return this.policies;
  }
}
