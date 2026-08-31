import { useQuery } from "@tanstack/react-query";
import { connectionsRepository } from "#/lib/data-platform/repositories/connections-repository";
import { ENVIRONMENT_QUERY_KEYS } from "./query-keys";
import { useEnvironmentOrgId } from "./use-environment-org";

export function useConnections() {
  const { data: orgId } = useEnvironmentOrgId();

  return useQuery({
    queryKey: ENVIRONMENT_QUERY_KEYS.connections(orgId ?? undefined),
    queryFn: () => connectionsRepository.list(orgId as string),
    enabled: Boolean(orgId),
    staleTime: 1000 * 15,
    retry: false,
    meta: { disableToast: true },
  });
}
