import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AutomationPolicyService, {
  type AutomationAlertSettings,
  type AutomationPolicy,
} from "#/api/automation-policy-service";
import { useActiveBackend } from "#/contexts/active-backend-context";

export const AUTOMATION_POLICIES_QUERY_KEY = ["automation-policies"] as const;

/**
 * Limits and alerts are enforced by the local automation guard sidecar, so
 * they only exist for local backends.
 */
export function useAutomationGuardAvailable() {
  return useActiveBackend().backend.kind === "local";
}

export function useAutomationPolicies() {
  const active = useActiveBackend();
  const available = active.backend.kind === "local";
  return useQuery({
    queryKey: [
      ...AUTOMATION_POLICIES_QUERY_KEY,
      active.backend.id,
      active.backend.connectionRevision ?? 0,
    ],
    queryFn: () => AutomationPolicyService.get(),
    enabled: available,
    // The guard writes pause/cancel notes on its own; keep them fresh while
    // the page is open.
    refetchInterval: 15_000,
  });
}

export function useSaveAutomationPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { disableToast: true },
    mutationFn: ({ id, policy }: { id: string; policy: AutomationPolicy }) =>
      AutomationPolicyService.savePolicy(id, policy),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: AUTOMATION_POLICIES_QUERY_KEY,
      }),
  });
}

export function useSaveAutomationAlerts() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { disableToast: true },
    mutationFn: (alerts: AutomationAlertSettings) =>
      AutomationPolicyService.saveAlerts(alerts),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: AUTOMATION_POLICIES_QUERY_KEY,
      }),
  });
}
