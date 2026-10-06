import { useQuery } from "@tanstack/react-query";
import { connectionsRepository } from "#/lib/data-platform/repositories/connections-repository";
import { ENVIRONMENT_QUERY_KEYS } from "./query-keys";
import { useEnvironmentOrgId } from "./use-environment-org";

export function useConnections() {
  const { data: orgId, isError: isOrgError } = useEnvironmentOrgId();

  const { data, isPending, isLoading, isError } = useQuery({
    queryKey: ENVIRONMENT_QUERY_KEYS.connections(orgId ?? undefined),
    queryFn: () => connectionsRepository.list(orgId as string),
    enabled: Boolean(orgId),
    staleTime: 1000 * 15,
    retry: false,
    meta: { disableToast: true },
  });

  // Surfaced separately from the connections query's own pending/loading
  // state: the connections query never runs at all while the org itself
  // couldn't be resolved (`enabled: Boolean(orgId)`), so it stays
  // permanently pending rather than erroring -- callers need this to tell
  // "the org lookup itself failed" apart from "still loading" or
  // "genuinely has nothing connected".
  return { data, isPending, isLoading, isError, isOrgError };
}
