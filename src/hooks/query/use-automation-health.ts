import { useQuery } from "@tanstack/react-query";
import AutomationService from "#/api/automation-service/automation-service.api";
import { useActiveBackend } from "#/contexts/active-backend-context";

export const AUTOMATION_HEALTH_QUERY_KEY = ["automation-health"] as const;

/** How often to re-probe while the service is not answering. */
const UNHEALTHY_POLL_MS = 5 * 1000;
/** How long a healthy answer is trusted before re-probing. */
const HEALTHY_STALE_MS = 30 * 1000;

export function useAutomationHealth() {
  const active = useActiveBackend();
  return useQuery({
    queryKey: [...AUTOMATION_HEALTH_QUERY_KEY, active.backend.id, active.orgId],
    queryFn: () => AutomationService.checkHealth(),
    staleTime: HEALTHY_STALE_MS,
    // `checkHealth` never throws — it reports a failure as `{status: "error"}` —
    // so React Query's own `retry` never fires and cannot help here. The
    // service is commonly still booting when the page first loads (a cold
    // `uvx` start has to download the package), and without this the first
    // failed probe would leave a dead-end error screen until the user
    // happened to press Retry. Poll while unhealthy and the page heals itself.
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.status === "ok" ? false : UNHEALTHY_POLL_MS,
    refetchIntervalInBackground: false,
    // A service that came up while the tab was hidden should be picked up as
    // soon as the user looks at it again.
    refetchOnWindowFocus: true,
  });
}
