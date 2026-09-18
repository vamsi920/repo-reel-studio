import { useQuery } from "@tanstack/react-query";
import AgentProfilesService from "#/api/agent-profiles-service/agent-profiles-service.api";
import { useActiveBackend } from "#/contexts/active-backend-context";
import {
  CONFIG_CACHE_OPTIONS,
  AGENT_PROFILES_QUERY_KEYS,
  AGENT_PROFILES_RETRY_OPTIONS,
} from "./query-keys";

export { AGENT_PROFILES_QUERY_KEYS };

interface UseAgentProfilesOptions {
  enabled?: boolean;
}

/**
 * List the user's AgentProfiles (Settings → Agent profiles library). On first
 * GET of an empty store the backend lazily seeds one default profile mirroring
 * the user's prior config (#3719), so the list is never empty for an upgrading
 * user. Works on both local and cloud backends — `AgentProfilesService` routes
 * cloud calls through the cloud proxy (OpenHands #15060).
 */
export function useAgentProfiles(options: UseAgentProfilesOptions = {}) {
  const { backend, orgId } = useActiveBackend();

  return useQuery({
    // Backend identity isolates the cache across backend/org switches.
    // Also include connectionRevision (bumped on an in-place host/apiKey
    // edit to the same backend.id, see active-backend-context.tsx) so
    // correcting a local backend's connection details doesn't keep serving
    // the previous agent-server's profile list until staleTime lapses.
    queryKey: [
      ...AGENT_PROFILES_QUERY_KEYS.all,
      backend.id,
      orgId,
      backend.connectionRevision ?? 0,
    ],
    queryFn: AgentProfilesService.listProfiles,
    ...CONFIG_CACHE_OPTIONS,
    ...AGENT_PROFILES_RETRY_OPTIONS,
    enabled: options.enabled ?? true,
    meta: { disableToast: true },
  });
}
