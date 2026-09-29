import { useQuery } from "@tanstack/react-query";
import { githubConnectionsRepository } from "#/lib/data-platform/repositories/github-connections-repository";
import { useSupabaseSession } from "./use-supabase-session";
import { GITHUB_CONNECTION_QUERY_KEY } from "./query-keys";

/**
 * Unlike `getConnection()` (which never rejects, so a real lookup failure --
 * e.g. an INC-8-style auth-timing glitch -- was indistinguishable from a
 * genuine "never connected" result to every consumer), the query function
 * here rejects when the lookup itself failed. `data` stays exactly
 * `GithubConnectionStatus | null` for every existing consumer that only
 * checks its truthiness, but `isError` now becomes a real signal a caller
 * can surface (see the Settings > Connections GitHub card) instead of that
 * failure being silently rendered as "Not connected". Mirrors
 * `useEnvironmentOrgId`'s identical fix for the org lookup.
 */
export const useGithubConnection = () => {
  const { status } = useSupabaseSession();

  return useQuery({
    queryKey: GITHUB_CONNECTION_QUERY_KEY,
    queryFn: async () => {
      const { connection, hadError } =
        await githubConnectionsRepository.getConnectionWithStatus();
      if (hadError) {
        throw new Error("Failed to check the GitHub connection");
      }
      return connection;
    },
    enabled: status === "real",
    staleTime: 1000 * 60,
    retry: false,
    meta: { disableToast: true },
  });
};
