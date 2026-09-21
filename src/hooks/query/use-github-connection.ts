import { useQuery } from "@tanstack/react-query";
import { githubConnectionsRepository } from "#/lib/data-platform/repositories/github-connections-repository";
import { useSupabaseSession } from "./use-supabase-session";
import { GITHUB_CONNECTION_QUERY_KEY } from "./query-keys";

export const useGithubConnection = () => {
  const { status } = useSupabaseSession();

  return useQuery({
    queryKey: GITHUB_CONNECTION_QUERY_KEY,
    queryFn: () => githubConnectionsRepository.getConnection(),
    enabled: status === "real",
    staleTime: 1000 * 60,
    retry: false,
    meta: { disableToast: true },
  });
};
