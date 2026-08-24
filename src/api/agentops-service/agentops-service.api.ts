/**
 * HTTP client for the Neo AgentOps Control Tower collector
 * (`scripts/agentops-server.mjs`), mounted behind the same ingress as the
 * agent-server at `/api/agentops`.
 *
 * Resolution mirrors `AutomationService`: the active *local* backend from the
 * backend registry supplies both the host and the `X-Session-API-Key`, so the
 * published npm package picks up the key `scripts/static-server.mjs` seeds into
 * localStorage rather than a build-time env var. `VITE_AGENTOPS_SERVICE_URL`
 * overrides the host for setups that run the collector somewhere else.
 *
 * The collector is a local companion process. When it is not running these
 * calls fail, and the Control Tower renders an explicit "collector not running"
 * state — it never falls back to fabricated data.
 */

import {
  getActiveBackend,
  getEffectiveLocalBackend,
} from "../backend-registry/active-store";
import { NoBackendAvailableError } from "../agent-server-client-options";
import type {
  AgentOpsApproval,
  AgentOpsAuditRecord,
  AgentOpsBudget,
  AgentOpsPolicies,
  AgentOpsRun,
  AgentOpsRunControl,
  AgentOpsRunDetail,
  AgentOpsSpan,
  AgentOpsSummary,
} from "./agentops-service.types";

const AGENTOPS_BASE_PATH = "/api/agentops";

export class AgentOpsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentOpsUnavailableError";
  }
}

/**
 * The collector reads a specific agent-server over its local REST API, so it
 * only means anything for local backends. Cloud backends are told so plainly
 * rather than being shown an empty tower.
 */
export function isAgentOpsSupportedBackend(): boolean {
  return getActiveBackend().backend.kind !== "cloud";
}

function resolveHost(): string {
  const override = import.meta.env.VITE_AGENTOPS_SERVICE_URL as
    | string
    | undefined;
  if (override) return override.replace(/\/+$/, "");
  const backend = getEffectiveLocalBackend();
  if (!backend) throw new NoBackendAvailableError();
  return backend.host.replace(/\/+$/, "");
}

function resolveApiKey(): string | null {
  const backend = getEffectiveLocalBackend();
  const apiKey = backend?.apiKey?.trim();
  return apiKey || null;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  { authenticated = true }: { authenticated?: boolean } = {},
): Promise<T> {
  const apiKey = authenticated ? resolveApiKey() : null;
  let response: Response;
  try {
    response = await fetch(`${resolveHost()}${AGENTOPS_BASE_PATH}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { "X-Session-API-Key": apiKey } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    // A network-level failure here almost always means the collector process
    // is not running; say that rather than surfacing "Failed to fetch".
    throw new AgentOpsUnavailableError(
      `The AgentOps collector is not reachable (${(error as Error).message}).`,
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `AgentOps request to ${path} failed: ${response.status} ${text}`,
    );
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

class AgentOpsService {
  /** Unauthenticated on purpose: it distinguishes "not running" from "401". */
  static async getHealth(): Promise<{ status: string }> {
    return request<{ status: string }>("/health", {}, { authenticated: false });
  }

  static async getSummary(): Promise<AgentOpsSummary> {
    return request<AgentOpsSummary>("/summary");
  }

  static async getRuns(
    params: {
      status?: string;
      workspace?: string;
      since?: string;
      limit?: number;
    } = {},
  ): Promise<AgentOpsRun[]> {
    const search = new URLSearchParams();
    if (params.status) search.set("status", params.status);
    if (params.workspace) search.set("workspace", params.workspace);
    if (params.since) search.set("since", params.since);
    if (params.limit) search.set("limit", String(params.limit));
    const query = search.toString();
    const { runs } = await request<{ runs: AgentOpsRun[] }>(
      `/runs${query ? `?${query}` : ""}`,
    );
    return runs;
  }

  static async getRun(runId: string): Promise<AgentOpsRunDetail> {
    return request<AgentOpsRunDetail>(`/runs/${encodeURIComponent(runId)}`);
  }

  static async getRunSpans(runId: string): Promise<AgentOpsSpan[]> {
    const { spans } = await request<{ spans: AgentOpsSpan[] }>(
      `/runs/${encodeURIComponent(runId)}/spans`,
    );
    return spans;
  }

  /**
   * Drives the runtime for real — the collector calls the agent-server's own
   * `/interrupt` (pause, cancel) and `/run` (resume) endpoints.
   */
  static async controlRun(
    runId: string,
    action: AgentOpsRunControl,
  ): Promise<void> {
    await request(`/runs/${encodeURIComponent(runId)}/${action}`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  static async getApprovals(
    state: "pending" | "all" = "pending",
  ): Promise<AgentOpsApproval[]> {
    const { approvals } = await request<{ approvals: AgentOpsApproval[] }>(
      `/approvals?state=${state}`,
    );
    return approvals;
  }

  static async decideApproval(
    approvalId: string,
    decision: "approve" | "reject",
    body: { reason?: string; additionalBudgetUsd?: number } = {},
  ): Promise<void> {
    await request(`/approvals/${encodeURIComponent(approvalId)}/${decision}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  static async getPolicies(): Promise<AgentOpsPolicies> {
    return request<AgentOpsPolicies>("/policies");
  }

  static async savePolicies(
    policies: AgentOpsPolicies,
  ): Promise<AgentOpsPolicies> {
    return request<AgentOpsPolicies>("/policies", {
      method: "PUT",
      body: JSON.stringify(policies),
    });
  }

  static async getBudgets(): Promise<{
    budgets: AgentOpsBudget[];
    agents: AgentOpsPolicies["agents"];
  }> {
    return request<{
      budgets: AgentOpsBudget[];
      agents: AgentOpsPolicies["agents"];
    }>("/budgets");
  }

  static async getAudit(
    params: {
      entity?: string;
      workspace?: string;
      since?: string;
      limit?: number;
    } = {},
  ): Promise<AgentOpsAuditRecord[]> {
    const search = new URLSearchParams();
    if (params.entity) search.set("entity", params.entity);
    if (params.workspace) search.set("workspace", params.workspace);
    if (params.since) search.set("since", params.since);
    if (params.limit) search.set("limit", String(params.limit));
    const query = search.toString();
    const { audit } = await request<{ audit: AgentOpsAuditRecord[] }>(
      `/audit${query ? `?${query}` : ""}`,
    );
    return audit;
  }
}

export default AgentOpsService;
