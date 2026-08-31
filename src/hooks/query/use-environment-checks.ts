import { useQuery } from "@tanstack/react-query";
import { environmentChecksRepository } from "#/lib/data-platform/repositories/environment-checks-repository";
import { ENVIRONMENT_QUERY_KEYS } from "./query-keys";
import { useEnvironmentOrgId } from "./use-environment-org";

export function useEnvironmentChecks(limit = 50) {
  const { data: orgId } = useEnvironmentOrgId();

  return useQuery({
    queryKey: ENVIRONMENT_QUERY_KEYS.checks(orgId ?? undefined, limit),
    queryFn: () => environmentChecksRepository.recent(orgId as string, limit),
    enabled: Boolean(orgId),
    staleTime: 1000 * 10,
    retry: false,
    meta: { disableToast: true },
  });
}
