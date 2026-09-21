import { useQuery } from "@tanstack/react-query";
import { resolveOrgId } from "#/lib/data-platform/repositories/repository-identity";
import { isSupabaseConfigured } from "#/lib/data-platform/client";
import { ENVIRONMENT_QUERY_KEYS } from "./query-keys";

/**
 * The org every Environment row is scoped to. Reuses the same bootstrap the
 * rest of the data platform uses (`resolveOrgId`), so a browser that has
 * already created workspaces lands in the org those workspaces belong to
 * rather than in a second, invisible one.
 */
export function useEnvironmentOrgId() {
  return useQuery({
    queryKey: ENVIRONMENT_QUERY_KEYS.orgId(),
    queryFn: () => resolveOrgId(),
    enabled: isSupabaseConfigured,
    staleTime: Infinity,
    retry: false,
    meta: { disableToast: true },
  });
}
