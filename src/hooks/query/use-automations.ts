import {
  keepPreviousData,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import AutomationService from "#/api/automation-service/automation-service.api";
import AutomationPolicyService from "#/api/automation-policy-service";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useTracking } from "#/hooks/use-tracking";
import { mintLocalGithubCloneCredential } from "#/api/git-service/mint-local-github-clone-credential";
import type { Automation, AutomationSpec } from "#/types/automation";
import { isCustomWebhookSource } from "#/utils/automation-webhook";
import {
  AUTOMATION_DETAIL_QUERY_KEY,
  AUTOMATION_RUNS_QUERY_KEY,
} from "./use-automation-detail";
import { AUTOMATION_POLICIES_QUERY_KEY } from "./use-automation-policies";

/**
 * Every caller of these mutations shows its own, more specific error toast;
 * without this the global MutationCache toasted the same failure again.
 */
const CALLER_TOASTS_ERRORS = { disableToast: true };

export const AUTOMATIONS_QUERY_KEY = ["automations"] as const;

interface UseAutomationsOptions {
  limit?: number;
  offset?: number;
  enabled?: boolean;
}

export function useAutomations(options: UseAutomationsOptions = {}) {
  const { limit = 50, offset = 0, enabled = true } = options;
  const active = useActiveBackend();
  return useQuery({
    // Include connectionRevision (bumped on an in-place host/apiKey edit to
    // the same backend.id, see active-backend-context.tsx) so correcting a
    // local backend's connection details doesn't keep serving the previous
    // agent-server's automation list until staleTime lapses.
    queryKey: [
      ...AUTOMATIONS_QUERY_KEY,
      { limit, offset },
      active.backend.id,
      active.orgId,
      active.backend.connectionRevision ?? 0,
    ],
    queryFn: () => AutomationService.getAutomations(limit, offset),
    staleTime: 0,
    enabled,
    // "Load more" grows `limit` (a new key); keep the loaded cards on screen
    // instead of replacing all of them with skeletons and losing the scroll.
    placeholderData: keepPreviousData,
  });
}

export function useToggleAutomation() {
  const queryClient = useQueryClient();
  const active = useActiveBackend();
  const { trackAutomationDisableButton } = useTracking();
  return useMutation({
    meta: CALLER_TOASTS_ERRORS,
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const automation = await AutomationService.toggleAutomation(id, enabled);
      // A manual on/off overrides a budget pause; otherwise the automation
      // guard would turn the automation back on by itself later.
      if (active.backend.kind === "local") {
        await AutomationPolicyService.clearPause(id).catch(() => {});
      }
      return automation;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: AUTOMATIONS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: AUTOMATION_DETAIL_QUERY_KEY });
      queryClient.invalidateQueries({
        queryKey: AUTOMATION_POLICIES_QUERY_KEY,
      });
      if (!variables.enabled) {
        trackAutomationDisableButton({ backendKind: active.backend.kind });
      }
    },
  });
}

export function useImportAutomation() {
  const queryClient = useQueryClient();
  const active = useActiveBackend();
  const { trackAutomationImported } = useTracking();
  return useMutation({
    meta: CALLER_TOASTS_ERRORS,
    mutationFn: (spec: AutomationSpec) =>
      AutomationService.createAutomation({ ...spec, enabled: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTOMATIONS_QUERY_KEY });
      trackAutomationImported({ backendKind: active.backend.kind });
    },
  });
}

export function useUpdateAutomation() {
  const queryClient = useQueryClient();
  const active = useActiveBackend();
  const { trackAutomationEdited } = useTracking();
  return useMutation({
    meta: CALLER_TOASTS_ERRORS,
    mutationFn: ({ id, body }: { id: string; body: Partial<Automation> }) =>
      AutomationService.updateAutomation(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTOMATIONS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: AUTOMATION_DETAIL_QUERY_KEY });
      trackAutomationEdited({ backendKind: active.backend.kind });
    },
  });
}

/** The automation's event source, from the cache when it is there. */
async function triggerSourceOf(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string,
): Promise<string | undefined> {
  const cached = queryClient
    .getQueriesData<{ automations?: Automation[] }>({
      queryKey: AUTOMATIONS_QUERY_KEY,
    })
    .flatMap(([, data]) => data?.automations ?? [])
    .find((automation) => automation.id === id);
  if (cached) return cached.trigger.source;
  try {
    return (await AutomationService.getAutomation(id)).trigger.source;
  } catch {
    return undefined;
  }
}

async function removeUnusedWebhook(source: string) {
  const { automations } = await AutomationService.getAutomations(100, 0);
  if (automations.some((automation) => automation.trigger.source === source))
    return;
  const webhook = (await AutomationService.listCustomWebhooks()).find(
    (hook) => hook.source === source,
  );
  if (webhook) await AutomationService.deleteCustomWebhook(webhook.id);
}

export function useDeleteAutomation() {
  const queryClient = useQueryClient();
  const active = useActiveBackend();
  const { trackAutomationDeleted } = useTracking();
  return useMutation({
    meta: CALLER_TOASTS_ERRORS,
    mutationFn: async (id: string) => {
      const source = await triggerSourceOf(queryClient, id);
      await AutomationService.deleteAutomation(id);
      if (active.backend.kind === "local") {
        await AutomationPolicyService.forget(id).catch(() => {});
      }
      // A webhook automation owns its webhook source; drop it once nothing
      // else listens on it, so its URL stops accepting events.
      if (isCustomWebhookSource(source)) {
        await removeUnusedWebhook(source!).catch(() => {});
      }
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: AUTOMATIONS_QUERY_KEY });
      // The detail query is cached for minutes; without this a link back to
      // the deleted automation rendered it with buttons that all 404.
      queryClient.removeQueries({
        queryKey: [...AUTOMATION_DETAIL_QUERY_KEY, id],
      });
      queryClient.removeQueries({
        queryKey: [...AUTOMATION_RUNS_QUERY_KEY, id],
      });
      trackAutomationDeleted({ backendKind: active.backend.kind });
    },
  });
}

export function useDispatchAutomation() {
  const queryClient = useQueryClient();
  const active = useActiveBackend();
  const { trackAutomationExecuted } = useTracking();
  return useMutation({
    meta: CALLER_TOASTS_ERRORS,
    mutationFn: async (id: string) => {
      // Automations only support GitHub repos today, and a locally-connected
      // GitHub credential is minted into a short-lived browser session, not
      // stored anywhere the automation backend can read later -- so a manual
      // dispatch (the one path with a live session) re-primes the
      // agent-server's secret store immediately before the run starts.
      // No-op when there's no local GitHub connection or on Cloud backends.
      await mintLocalGithubCloneCredential("github");
      return AutomationService.dispatchAutomation(id);
    },
    onSuccess: (_run, id) => {
      queryClient.invalidateQueries({ queryKey: AUTOMATIONS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: AUTOMATION_DETAIL_QUERY_KEY });
      queryClient.invalidateQueries({
        queryKey: [...AUTOMATION_RUNS_QUERY_KEY, id],
      });
      trackAutomationExecuted({ backendKind: active.backend.kind });
    },
  });
}

export function useCancelAutomationRun() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: CALLER_TOASTS_ERRORS,
    mutationFn: ({ runId }: { automationId: string; runId: string }) =>
      AutomationService.cancelAutomationRun(runId),
    onSuccess: (_run, { automationId }) => {
      queryClient.invalidateQueries({ queryKey: AUTOMATIONS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: AUTOMATION_DETAIL_QUERY_KEY });
      queryClient.invalidateQueries({
        queryKey: [...AUTOMATION_RUNS_QUERY_KEY, automationId],
      });
    },
  });
}
