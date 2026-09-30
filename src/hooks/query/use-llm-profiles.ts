import { useQuery, useQueryClient } from "@tanstack/react-query";
import ProfilesService, {
  type ProfileListResponse,
} from "#/api/profiles-service/profiles-service.api";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { CONFIG_CACHE_OPTIONS, LLM_PROFILES_QUERY_KEYS } from "./query-keys";

export { LLM_PROFILES_QUERY_KEYS };

interface UseLlmProfilesOptions {
  enabled?: boolean;
}

// A restart-window race on the agent-server (INC-3: no persistent storage,
// frequent restarts) can transiently return a 0-profile list even though
// profiles still exist server-side — sometimes two back-to-back reads of the
// same endpoint disagree within milliseconds of each other. A single wait +
// re-read before trusting the empty result keeps a working account from
// spuriously reading as "no LLM configured" during that window, without
// masking a genuine "all profiles deleted" response (which stays empty on
// the re-read too, and is trusted after this one retry).
const EMPTY_PROFILES_RETRY_DELAY_MS = 500;

export function useLlmProfiles(options: UseLlmProfilesOptions = {}) {
  const { backend, orgId } = useActiveBackend();
  const queryClient = useQueryClient();
  const queryKey = [
    ...LLM_PROFILES_QUERY_KEYS.all,
    backend.id,
    orgId,
    backend.connectionRevision ?? 0,
  ];

  return useQuery({
    // Include backend identity to prevent cache pollution when switching
    // backends. Also include connectionRevision (bumped on an in-place
    // host/apiKey edit to the same backend.id, see active-backend-context.tsx)
    // so correcting a local backend's connection details doesn't keep serving
    // the previous agent-server's profile list until staleTime lapses.
    queryKey,
    queryFn: async ({ queryKey: activeQueryKey }) => {
      const result = await ProfilesService.listProfiles();
      if (result.profiles.length > 0) return result;

      const previous =
        queryClient.getQueryData<ProfileListResponse>(activeQueryKey);
      if (!previous || previous.profiles.length === 0) return result;

      await new Promise((resolve) => {
        setTimeout(resolve, EMPTY_PROFILES_RETRY_DELAY_MS);
      });
      return ProfilesService.listProfiles();
    },
    ...CONFIG_CACHE_OPTIONS,
    enabled: options.enabled ?? true,
    meta: { disableToast: true },
  });
}
