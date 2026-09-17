/**
 * React Query hooks for the AgentOps Control Tower.
 *
 * Live surfaces poll: the collector is the source of truth and there is no
 * push channel from it to the browser. Poll intervals are deliberately
 * different per surface — Live Runs and the Overview tiles are what someone
 * watches while an agent works, whereas History and Budgets change slowly.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import AgentOpsService, {
  isAgentOpsNotFoundError,
  isAgentOpsSupportedBackend,
} from "#/api/agentops-service/agentops-service.api";
import { useActiveBackend } from "#/contexts/active-backend-context";
import type {
  AgentOpsApproval,
  AgentOpsAuditRecord,
  AgentOpsBudget,
  AgentOpsPolicies,
  AgentOpsRun,
  AgentOpsRunControl,
  AgentOpsRunDetail,
  AgentOpsSummary,
} from "#/api/agentops-service/agentops-service.types";

// Every request goes to whichever backend's host/API key
// `agentops-service.api.ts` resolves *at fetch time* — a local agent-server
// the collector polls. Keying every query on `backendId` (as the other
// per-backend hooks in this codebase do, see `active-backend-context.tsx`)
// makes React Query treat switching backends as a brand-new query instead of
// reusing/overwriting the previous backend's cached runs/budgets/audit.
export const AGENTOPS_QUERY_KEYS = {
  all: ["agentops"] as const,
  summary: (backendId: string) => ["agentops", "summary", backendId] as const,
  runs: (backendId: string, filter?: string) =>
    ["agentops", "runs", backendId, filter ?? "all"] as const,
  run: (backendId: string, runId: string) =>
    ["agentops", "run", backendId, runId] as const,
  approvals: (backendId: string, state: string) =>
    ["agentops", "approvals", backendId, state] as const,
  policies: (backendId: string) => ["agentops", "policies", backendId] as const,
  budgets: (backendId: string) => ["agentops", "budgets", backendId] as const,
  audit: (backendId: string, entity?: string) =>
    ["agentops", "audit", backendId, entity ?? "all"] as const,
} as const;

/** Live surfaces (Overview tiles, Live Runs, Approvals). */
const LIVE_REFETCH_MS = 3000;
/** Slow surfaces (History, Budgets, Audit). */
const SLOW_REFETCH_MS = 30000;

// The collector either answers or it doesn't; retrying a connection-refused
// three times only delays the "collector not running" message. And
// `disableToast` is set because a down collector already has a dedicated,
// explanatory `CollectorUnavailable` card (see agentops-panel.tsx) — the
// global query-error toast handler in query-client-config.ts would otherwise
// stack a redundant toast per parallel query on top of it.
const NO_RETRY = {
  retry: false,
  meta: { disableToast: true },
} as const;

// The mutations below each have exactly one caller, and that caller shows its
// own toast with a translated fallback (see `getAgentOpsErrorMessage`).
// Without this the global MutationCache handler in query-client-config.ts
// shows a second, identical toast for the same failure.
const COMPONENT_OWNS_TOAST = {
  meta: { disableToast: true },
} as const;

export function useAgentOpsSummary(): UseQueryResult<AgentOpsSummary> {
  const { backend } = useActiveBackend();
  return useQuery({
    queryKey: AGENTOPS_QUERY_KEYS.summary(backend.id),
    queryFn: AgentOpsService.getSummary,
    enabled: isAgentOpsSupportedBackend(),
    refetchInterval: LIVE_REFETCH_MS,
    ...NO_RETRY,
  });
}

export function useAgentOpsRuns(
  options: {
    status?: string;
    live?: boolean;
  } = {},
): UseQueryResult<AgentOpsRun[]> {
  const { status, live = true } = options;
  const { backend } = useActiveBackend();
  return useQuery({
    queryKey: AGENTOPS_QUERY_KEYS.runs(backend.id, status),
    queryFn: () => AgentOpsService.getRuns({ status }),
    enabled: isAgentOpsSupportedBackend(),
    refetchInterval: live ? LIVE_REFETCH_MS : SLOW_REFETCH_MS,
    ...NO_RETRY,
  });
}

/**
 * A finished or errored run is history until someone sends the conversation
 * another message, so its detail page polls at the History cadence rather
 * than the live one — the detail read is four store queries per tick.
 *
 * A run the collector does not know (404) is not polled at all: `retry:
 * false` only stops retries within one fetch, and re-asking for an unknown
 * id every 3 s just fills the console with 404s. A collector outage keeps
 * polling so the page recovers on its own once it is back.
 */
export function runDetailRefetchInterval(
  detail: AgentOpsRunDetail | undefined,
  error: unknown = null,
): number | false {
  if (isAgentOpsNotFoundError(error)) return false;
  const status = detail?.run.status;
  return status === "finished" || status === "error"
    ? SLOW_REFETCH_MS
    : LIVE_REFETCH_MS;
}

export function useAgentOpsRun(
  runId: string | null,
): UseQueryResult<AgentOpsRunDetail> {
  const { backend } = useActiveBackend();
  return useQuery({
    queryKey: AGENTOPS_QUERY_KEYS.run(backend.id, runId ?? ""),
    queryFn: () => AgentOpsService.getRun(runId as string),
    enabled: Boolean(runId) && isAgentOpsSupportedBackend(),
    refetchInterval: (query) =>
      runDetailRefetchInterval(query.state.data, query.state.error),
    ...NO_RETRY,
  });
}

export function useAgentOpsApprovals(
  state: "pending" | "all" = "pending",
): UseQueryResult<AgentOpsApproval[]> {
  const { backend } = useActiveBackend();
  return useQuery({
    queryKey: AGENTOPS_QUERY_KEYS.approvals(backend.id, state),
    queryFn: () => AgentOpsService.getApprovals(state),
    enabled: isAgentOpsSupportedBackend(),
    refetchInterval: LIVE_REFETCH_MS,
    ...NO_RETRY,
  });
}

/**
 * Polled at the Budgets cadence like `useAgentOpsBudgets`, not fetched once:
 * with `retry: false` a query that never refetches turns a single failed
 * request — every Fly deploy restarts the collector for a few seconds — into
 * a permanent error, and the Budgets tab (which treats any errored query as
 * "collector down") would stay on that card until the tab was remounted.
 */
export function useAgentOpsPolicies(): UseQueryResult<AgentOpsPolicies> {
  const { backend } = useActiveBackend();
  return useQuery({
    queryKey: AGENTOPS_QUERY_KEYS.policies(backend.id),
    queryFn: AgentOpsService.getPolicies,
    enabled: isAgentOpsSupportedBackend(),
    refetchInterval: SLOW_REFETCH_MS,
    ...NO_RETRY,
  });
}

export function useAgentOpsBudgets(): UseQueryResult<{
  budgets: AgentOpsBudget[];
  agents: AgentOpsPolicies["agents"];
}> {
  const { backend } = useActiveBackend();
  return useQuery({
    queryKey: AGENTOPS_QUERY_KEYS.budgets(backend.id),
    queryFn: AgentOpsService.getBudgets,
    enabled: isAgentOpsSupportedBackend(),
    refetchInterval: SLOW_REFETCH_MS,
    ...NO_RETRY,
  });
}

export function useAgentOpsAudit(
  entity?: string,
): UseQueryResult<AgentOpsAuditRecord[]> {
  const { backend } = useActiveBackend();
  return useQuery({
    queryKey: AGENTOPS_QUERY_KEYS.audit(backend.id, entity),
    queryFn: () => AgentOpsService.getAudit({ entity }),
    enabled: isAgentOpsSupportedBackend(),
    refetchInterval: SLOW_REFETCH_MS,
    ...NO_RETRY,
  });
}

/**
 * Pause / resume / cancel. These reach the agent-server for real via the
 * collector; there is no optimistic state, because claiming a run is paused
 * before the runtime says so is exactly the lie this surface must not tell.
 */
export function useAgentOpsRunControl() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["agentops", "run-control"],
    ...COMPONENT_OWNS_TOAST,
    mutationFn: ({
      runId,
      action,
    }: {
      runId: string;
      action: AgentOpsRunControl;
    }) => AgentOpsService.controlRun(runId, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AGENTOPS_QUERY_KEYS.all });
    },
  });
}

export function useAgentOpsApprovalDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["agentops", "approval-decision"],
    ...COMPONENT_OWNS_TOAST,
    mutationFn: ({
      approvalId,
      decision,
      reason,
      additionalBudgetUsd,
    }: {
      approvalId: string;
      decision: "approve" | "reject";
      reason?: string;
      additionalBudgetUsd?: number;
    }) =>
      AgentOpsService.decideApproval(approvalId, decision, {
        reason,
        additionalBudgetUsd,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AGENTOPS_QUERY_KEYS.all });
    },
  });
}

export function useSaveAgentOpsPolicies() {
  const queryClient = useQueryClient();
  const { backend } = useActiveBackend();
  return useMutation({
    mutationKey: ["agentops", "save-policies"],
    ...COMPONENT_OWNS_TOAST,
    mutationFn: (policies: AgentOpsPolicies) =>
      AgentOpsService.savePolicies(policies),
    onSuccess: (saved) => {
      // Write the collector's confirmed copy into the caches the budgets form
      // reads from before the refetch lands, so a form that drops its local
      // edits on success shows the new limits rather than the old ones for
      // a round trip.
      queryClient.setQueryData(AGENTOPS_QUERY_KEYS.policies(backend.id), saved);
      queryClient.setQueryData<{
        budgets: AgentOpsBudget[];
        agents: AgentOpsPolicies["agents"];
      }>(AGENTOPS_QUERY_KEYS.budgets(backend.id), (current) =>
        current
          ? {
              agents: saved.agents,
              budgets: current.budgets.map((budget) => ({
                ...budget,
                policy: {
                  ...budget.policy,
                  ...(saved.workspaces[budget.workspaceId] ?? {}),
                },
              })),
            }
          : current,
      );
      queryClient.invalidateQueries({ queryKey: AGENTOPS_QUERY_KEYS.all });
    },
  });
}
