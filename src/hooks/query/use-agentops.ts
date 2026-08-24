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
  isAgentOpsSupportedBackend,
} from "#/api/agentops-service/agentops-service.api";
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

export const AGENTOPS_QUERY_KEYS = {
  all: ["agentops"] as const,
  summary: ["agentops", "summary"] as const,
  runs: (filter?: string) => ["agentops", "runs", filter ?? "all"] as const,
  run: (runId: string) => ["agentops", "run", runId] as const,
  approvals: (state: string) => ["agentops", "approvals", state] as const,
  policies: ["agentops", "policies"] as const,
  budgets: ["agentops", "budgets"] as const,
  audit: (entity?: string) => ["agentops", "audit", entity ?? "all"] as const,
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

export function useAgentOpsSummary(): UseQueryResult<AgentOpsSummary> {
  return useQuery({
    queryKey: AGENTOPS_QUERY_KEYS.summary,
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
  return useQuery({
    queryKey: AGENTOPS_QUERY_KEYS.runs(status),
    queryFn: () => AgentOpsService.getRuns({ status }),
    enabled: isAgentOpsSupportedBackend(),
    refetchInterval: live ? LIVE_REFETCH_MS : SLOW_REFETCH_MS,
    ...NO_RETRY,
  });
}

export function useAgentOpsRun(
  runId: string | null,
): UseQueryResult<AgentOpsRunDetail> {
  return useQuery({
    queryKey: AGENTOPS_QUERY_KEYS.run(runId ?? ""),
    queryFn: () => AgentOpsService.getRun(runId as string),
    enabled: Boolean(runId) && isAgentOpsSupportedBackend(),
    refetchInterval: LIVE_REFETCH_MS,
    ...NO_RETRY,
  });
}

export function useAgentOpsApprovals(
  state: "pending" | "all" = "pending",
): UseQueryResult<AgentOpsApproval[]> {
  return useQuery({
    queryKey: AGENTOPS_QUERY_KEYS.approvals(state),
    queryFn: () => AgentOpsService.getApprovals(state),
    enabled: isAgentOpsSupportedBackend(),
    refetchInterval: LIVE_REFETCH_MS,
    ...NO_RETRY,
  });
}

export function useAgentOpsPolicies(): UseQueryResult<AgentOpsPolicies> {
  return useQuery({
    queryKey: AGENTOPS_QUERY_KEYS.policies,
    queryFn: AgentOpsService.getPolicies,
    enabled: isAgentOpsSupportedBackend(),
    ...NO_RETRY,
  });
}

export function useAgentOpsBudgets(): UseQueryResult<{
  budgets: AgentOpsBudget[];
  agents: AgentOpsPolicies["agents"];
}> {
  return useQuery({
    queryKey: AGENTOPS_QUERY_KEYS.budgets,
    queryFn: AgentOpsService.getBudgets,
    enabled: isAgentOpsSupportedBackend(),
    refetchInterval: SLOW_REFETCH_MS,
    ...NO_RETRY,
  });
}

export function useAgentOpsAudit(
  entity?: string,
): UseQueryResult<AgentOpsAuditRecord[]> {
  return useQuery({
    queryKey: AGENTOPS_QUERY_KEYS.audit(entity),
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
  return useMutation({
    mutationKey: ["agentops", "save-policies"],
    mutationFn: (policies: AgentOpsPolicies) =>
      AgentOpsService.savePolicies(policies),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AGENTOPS_QUERY_KEYS.all });
    },
  });
}
