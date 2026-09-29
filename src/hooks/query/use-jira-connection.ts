import { useQuery } from "@tanstack/react-query";
import { jiraConnectionsRepository } from "#/lib/data-platform/repositories/jira-connections-repository";
import { useSupabaseSession } from "./use-supabase-session";
import { JIRA_CONNECTION_QUERY_KEY } from "./query-keys";

/** See use-github-connection.ts's identical fix: `data` stays exactly
 * `JiraConnectionStatus | null` for every existing consumer, but `isError`
 * now becomes a real signal instead of a lookup failure silently rendering
 * as "Not connected". */
export const useJiraConnection = () => {
  const { status } = useSupabaseSession();

  return useQuery({
    queryKey: JIRA_CONNECTION_QUERY_KEY,
    queryFn: async () => {
      const { connection, hadError } =
        await jiraConnectionsRepository.getConnectionWithStatus();
      if (hadError) {
        throw new Error("Failed to check the Jira connection");
      }
      return connection;
    },
    enabled: status === "real",
    staleTime: 1000 * 60,
    retry: false,
    meta: { disableToast: true },
  });
};
