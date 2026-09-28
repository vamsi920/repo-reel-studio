import { useQuery } from "@tanstack/react-query";
import { resolveOrgIdWithStatus } from "#/lib/data-platform/repositories/repository-identity";
import { isSupabaseConfigured } from "#/lib/data-platform/client";
import { ENVIRONMENT_QUERY_KEYS } from "./query-keys";

/**
 * The org every Environment row is scoped to. Reuses the same bootstrap the
 * rest of the data platform uses (`resolveOrgIdWithStatus`), so a browser
 * that has already created workspaces lands in the org those workspaces
 * belong to rather than in a second, invisible one.
 *
 * Unlike `resolveOrgId()` (which always resolves, even on a real internal
 * failure), the query function here rejects when the lookup itself failed —
 * `data` stays `string | null` exactly as before for every existing
 * consumer that only checks its truthiness, but `isError` now becomes a
 * real signal a caller can surface (see the Environment > Connections page,
 * INC-8) instead of a genuine failure being indistinguishable from "no org
 * yet".
 */
export function useEnvironmentOrgId() {
  return useQuery({
    queryKey: ENVIRONMENT_QUERY_KEYS.orgId(),
    queryFn: async () => {
      const { orgId, hadError } = await resolveOrgIdWithStatus();
      if (hadError) throw new Error("Failed to resolve the environment org");
      return orgId;
    },
    enabled: isSupabaseConfigured,
    staleTime: Infinity,
    retry: false,
    meta: { disableToast: true },
  });
}
