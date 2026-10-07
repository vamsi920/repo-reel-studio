import { useQuery } from "@tanstack/react-query";
import { listConnectionEvents } from "#/lib/data-platform/repositories/connection-events-repository";
import { ENVIRONMENT_QUERY_KEYS } from "./query-keys";
import { useEnvironmentOrgId } from "./use-environment-org";

export function useConnectionEvents() {
  const { data: orgId } = useEnvironmentOrgId();
  return useQuery({
    queryKey: ENVIRONMENT_QUERY_KEYS.connectionEvents(orgId ?? undefined),
    queryFn: () => listConnectionEvents(orgId as string),
    enabled: Boolean(orgId),
    staleTime: 1000 * 30,
    retry: false,
    meta: { disableToast: true },
  });
}
