#!/usr/bin/env node
/**
 * NeoDevEx AgentOps Control Tower — collector + governance API.
 *
 * OpenHands agent-server remains the agent runtime and is not modified by this
 * process. AgentOps supplies the observability vocabulary (vendored under
 * `vendor/agentops/semconv/`, MIT). This sidecar is the NeoDevEx control layer:
 * it tails the runtime, records runs/spans/audit, evaluates budget and autonomy
 * policy, and exposes the approvals queue and the run controls the UI drives.
 *
 * It is mounted behind the same ingress as the agent-server and the automation
 * backend, at `/api/agentops`, and authenticates with the same
 * `X-Session-API-Key` header they use.
 *
 * Usage:
 *   node scripts/agentops-server.mjs
 *
 * Env:
 *   AGENTOPS_PORT          Port to listen on (default 18002)
 *   AGENT_SERVER_URL       agent-server base URL (default http://127.0.0.1:18000)
 *   AGENTOPS_STORE_DIR     Store directory (default ~/.neodevex/agentops)
 *   LOCAL_BACKEND_API_KEY  Overrides the auto-discovered session API key
 *                          (falls back to the same persisted key file the dev
 *                          launchers already generate and use)
 */

import { createServer } from "node:http";
import process from "node:process";

import { AgentServerClient } from "./agentops/agent-server-client.mjs";
import { Collector } from "./agentops/collector.mjs";
import { AgentOpsStore, DEFAULT_STORE_DIR } from "./agentops/store.mjs";
import {
  computeSpend,
  monthStart,
  projectMonthlySpend,
  summarize,
} from "./agentops/policy.mjs";

const PORT = Number(process.env.AGENTOPS_PORT || 18002);
const AGENT_SERVER_URL = (
  process.env.AGENT_SERVER_URL || "http://127.0.0.1:18000"
).replace(/\/+$/, "");
const BASE_PATH = "/api/agentops";

/**
 * The session key this sidecar both presents to the agent-server and requires
 * from its own callers — the same key and the same `X-Session-API-Key` header
 * the agent-server and automation backend use.
 *
 * `LOCAL_BACKEND_API_KEY` is how every launcher passes it (the dev stacks set
 * it when spawning this process; the Docker entrypoint exports the effective
 * key). Only when it is absent — someone running this file by hand — do we
 * reach for the dev launcher's persisted key file, and that import is dynamic
 * so the Docker image does not have to ship `dev-safe.mjs` and its dev-only
 * dependencies.
 */
async function resolveSessionApiKey() {
  if (process.env.LOCAL_BACKEND_API_KEY)
    return process.env.LOCAL_BACKEND_API_KEY;
  try {
    const { getOrCreatePersistedApiKeyFile } = await import("./dev-safe.mjs");
    return getOrCreatePersistedApiKeyFile();
  } catch (error) {
    console.warn(
      `[agentops] No LOCAL_BACKEND_API_KEY and no persisted key (${error.message}). ` +
        "Starting unauthenticated — the agent-server will reject reads if it " +
        "requires a session key.",
    );
    return null;
  }
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
    // Governance data is per-request truth; a cached Live Runs table is a lie.
    "cache-control": "no-store",
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      // Policies are the only writable payload and they are tiny; anything
      // larger is a bug or an attack, not a legitimate request.
      if (size > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      if (!raw) return resolve(null);
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Body is not valid JSON"));
      }
    });
    req.on("error", reject);
  });
}

/** Budget rollup for one workspace: used / remaining / projected. */
function budgetForWorkspace(store, workspaceId, now) {
  const policy = store.getWorkspacePolicy(workspaceId);
  const since = monthStart(now);
  const runs = store.listRuns({ limit: 10000 });
  const spend = computeSpend(runs, { workspaceId, since });
  const projectedUsd = projectMonthlySpend(spend.usedUsd, now);

  return {
    workspaceId,
    policy,
    periodStart: since,
    usedUsd: spend.usedUsd,
    remainingUsd:
      typeof policy.monthlyBudgetUsd === "number"
        ? Math.max(0, policy.monthlyBudgetUsd - spend.usedUsd)
        : null,
    // Straight-line run-rate extrapolation of this month's actual spend, not a
    // forecast and not a bill. Null until an hour of the month has elapsed.
    projectedUsd,
    runCount: spend.runCount,
    // Runs whose provider reported no cost. Surfaced so the UI can say
    // "no cost reported" rather than implying those runs were free.
    runsWithoutReportedCost: spend.runsWithoutCost,
    tokens: spend.tokens,
  };
}

async function main() {
  const apiKey = await resolveSessionApiKey();
  const store = new AgentOpsStore();
  const client = new AgentServerClient({
    baseUrl: AGENT_SERVER_URL,
    sessionApiKey: apiKey,
  });
  const collector = new Collector({ client, store });

  const routes = createRouter({ store, client, collector });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname.startsWith(BASE_PATH)
      ? url.pathname.slice(BASE_PATH.length) || "/"
      : url.pathname;

    // Liveness is unauthenticated so the UI can distinguish "collector not
    // running" from "collector rejected me" without holding a key.
    if (path === "/health") {
      sendJson(res, 200, {
        status: "ok",
        storeDir: DEFAULT_STORE_DIR,
        agentServerUrl: AGENT_SERVER_URL,
        collector: collector.health(),
      });
      return;
    }

    const provided = req.headers["x-session-api-key"];
    if (apiKey && provided !== apiKey) {
      sendJson(res, 401, { error: "Invalid or missing X-Session-API-Key" });
      return;
    }

    try {
      const handled = await routes(req, res, path, url);
      if (!handled) sendJson(res, 404, { error: `No route for ${path}` });
    } catch (error) {
      console.error(`[agentops] ${req.method} ${path} failed:`, error.message);
      sendJson(res, 500, { error: error.message });
    }
  });

  server.listen(PORT, () => {
    console.log(
      `[agentops] Control Tower listening on http://127.0.0.1:${PORT}${BASE_PATH}`,
    );
    console.log(`[agentops] agent-server: ${AGENT_SERVER_URL}`);
    console.log(`[agentops] store:        ${DEFAULT_STORE_DIR}`);
    collector.start();
  });

  const shutdown = () => {
    collector.stop();
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function createRouter({ store, client, collector }) {
  return async function route(req, res, path, url) {
    const method = req.method ?? "GET";
    const now = new Date().toISOString();

    if (method === "GET" && path === "/summary") {
      sendJson(res, 200, {
        ...summarize(
          store.listRuns({ limit: 10000 }),
          store.listApprovals({ state: "all" }),
          now,
        ),
        collector: collector.health(),
      });
      return true;
    }

    if (method === "GET" && path === "/runs") {
      sendJson(res, 200, {
        runs: store.listRuns({
          status: url.searchParams.get("status") ?? undefined,
          workspaceId: url.searchParams.get("workspace") ?? undefined,
          since: url.searchParams.get("since") ?? undefined,
          limit: Number(url.searchParams.get("limit") ?? 200),
        }),
      });
      return true;
    }

    const runSpansMatch = path.match(/^\/runs\/([^/]+)\/spans$/);
    if (method === "GET" && runSpansMatch) {
      const runId = decodeURIComponent(runSpansMatch[1]);
      if (!store.getRun(runId)) {
        sendJson(res, 404, { error: `Unknown run ${runId}` });
        return true;
      }
      sendJson(res, 200, { spans: store.listSpans(runId) });
      return true;
    }

    const runControlMatch = path.match(
      /^\/runs\/([^/]+)\/(pause|resume|cancel)$/,
    );
    if (method === "POST" && runControlMatch) {
      const runId = decodeURIComponent(runControlMatch[1]);
      const action = runControlMatch[2];
      const run = store.getRun(runId);
      if (!run) {
        sendJson(res, 404, { error: `Unknown run ${runId}` });
        return true;
      }

      // These call the runtime for real. `pause` and `cancel` both map to
      // `/interrupt`, which is what actually halts in-flight work on a local
      // agent-server; `cancel` differs in that the UI requires a confirmation
      // first and the audit records it as an operator cancellation.
      if (action === "resume") await client.runConversation(runId);
      else await client.interruptConversation(runId);

      store.appendAudit({
        at: now,
        actor: "user",
        action: action === "resume" ? "run.resumed" : `run.${action}`,
        summary:
          action === "resume"
            ? "Run resumed from the Control Tower"
            : `Run ${action === "cancel" ? "cancelled" : "paused"} from the Control Tower`,
        entityType: "run",
        entityId: runId,
        workspaceId: run.workspaceId,
      });

      sendJson(res, 200, { ok: true, action, runId });
      return true;
    }

    const runMatch = path.match(/^\/runs\/([^/]+)$/);
    if (method === "GET" && runMatch) {
      const runId = decodeURIComponent(runMatch[1]);
      const run = store.getRun(runId);
      if (!run) {
        sendJson(res, 404, { error: `Unknown run ${runId}` });
        return true;
      }
      sendJson(res, 200, {
        run,
        spans: store.listSpans(runId),
        audit: store.listAudit({ entityId: runId }),
        approvals: store
          .listApprovals({ state: "all" })
          .filter((approval) => approval.runId === runId),
      });
      return true;
    }

    if (method === "GET" && path === "/approvals") {
      sendJson(res, 200, {
        approvals: store.listApprovals({
          state: url.searchParams.get("state") ?? "pending",
        }),
      });
      return true;
    }

    const approvalMatch = path.match(
      /^\/approvals\/([^/]+)\/(approve|reject)$/,
    );
    if (method === "POST" && approvalMatch) {
      const approvalId = decodeURIComponent(approvalMatch[1]);
      const decision = approvalMatch[2];
      const approval = store.getApproval(approvalId);
      if (!approval) {
        sendJson(res, 404, { error: `Unknown approval ${approvalId}` });
        return true;
      }
      if (approval.state !== "pending") {
        sendJson(res, 409, {
          error: `Approval ${approvalId} is already ${approval.state}`,
        });
        return true;
      }
      const body = await readBody(req).catch(() => null);
      const reason = typeof body?.reason === "string" ? body.reason : undefined;

      if (approval.kind === "confirmation") {
        // The runtime is genuinely blocked on this; answering it is what
        // unblocks the agent.
        await client.respondToConfirmation(approval.runId, {
          accept: decision === "approve",
          reason,
        });
      } else if (approval.kind === "budget") {
        if (decision === "approve") {
          // Approving a budget breach raises the limit to cover the overspend
          // plus the operator-supplied headroom, then resumes the run. Without
          // a new limit the collector would halt it again on the next tick.
          const additionalUsd =
            typeof body?.additionalBudgetUsd === "number"
              ? body.additionalBudgetUsd
              : 0;
          const policies = store.getPolicies();
          const workspace = policies.workspaces[approval.workspaceId] ?? {};
          const breach = approval.breaches?.[0];
          if (breach?.scope === "run") {
            workspace.runBudgetUsd = breach.usedUsd + additionalUsd;
          } else if (breach?.scope === "workspace") {
            workspace.monthlyBudgetUsd = breach.usedUsd + additionalUsd;
          } else if (breach?.scope === "agent") {
            policies.agents[approval.agentName] = {
              ...(policies.agents[approval.agentName] ?? {}),
              agentBudgetUsd: breach.usedUsd + additionalUsd,
            };
          }
          policies.workspaces[approval.workspaceId] = workspace;
          store.setPolicies(policies);
          await client.runConversation(approval.runId);
        }
        // Rejecting leaves the run halted — it is already interrupted.
      }

      store.upsertApproval({
        ...approval,
        state: decision === "approve" ? "approved" : "rejected",
        decidedAt: now,
        decisionReason: reason ?? null,
      });

      store.appendAudit({
        at: now,
        actor: "user",
        action:
          decision === "approve" ? "approval.granted" : "approval.rejected",
        summary: `${decision === "approve" ? "Approved" : "Rejected"}: ${approval.title}`,
        entityType: "approval",
        entityId: approval.id,
        workspaceId: approval.workspaceId,
        metadata: {
          runId: approval.runId,
          kind: approval.kind,
          reason: reason ?? null,
        },
      });

      sendJson(res, 200, { ok: true, approvalId, decision });
      return true;
    }

    if (method === "GET" && path === "/policies") {
      sendJson(res, 200, store.getPolicies());
      return true;
    }

    if (method === "PUT" && path === "/policies") {
      const body = await readBody(req);
      if (!body || typeof body !== "object") {
        sendJson(res, 400, { error: "Expected a JSON policies object" });
        return true;
      }
      const saved = store.setPolicies(body);
      store.appendAudit({
        at: now,
        actor: "user",
        action: "policy.updated",
        summary: "Workspace/agent policies updated",
        entityType: "policy",
        entityId: "policies",
      });
      sendJson(res, 200, saved);
      return true;
    }

    if (method === "GET" && path === "/budgets") {
      const runs = store.listRuns({ limit: 10000 });
      const workspaceIds = new Set(runs.map((run) => run.workspaceId));
      for (const id of Object.keys(store.getPolicies().workspaces)) {
        workspaceIds.add(id);
      }
      sendJson(res, 200, {
        budgets: [...workspaceIds].map((id) =>
          budgetForWorkspace(store, id, now),
        ),
        agents: store.getPolicies().agents,
      });
      return true;
    }

    if (method === "GET" && path === "/audit") {
      sendJson(res, 200, {
        audit: store.listAudit({
          entityId: url.searchParams.get("entity") ?? undefined,
          workspaceId: url.searchParams.get("workspace") ?? undefined,
          since: url.searchParams.get("since") ?? undefined,
          limit: Number(url.searchParams.get("limit") ?? 500),
        }),
      });
      return true;
    }

    return false;
  };
}

main().catch((error) => {
  console.error(`[agentops] failed to start: ${error.message}`);
  process.exitCode = 1;
});
