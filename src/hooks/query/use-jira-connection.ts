import { useQuery } from "@tanstack/react-query";
import { jiraConnectionsRepository } from "#/lib/data-platform/repositories/jira-connections-repository";
import { useSupabaseSession } from "./use-supabase-session";
import { JIRA_CONNECTION_QUERY_KEY } from "./query-keys";

export const useJiraConnection = () => {
  const { status } = useSupabaseSession();

  return useQuery({
    queryKey: JIRA_CONNECTION_QUERY_KEY,
    queryFn: () => jiraConnectionsRepository.getConnection(),
    enabled: status === "real",
    staleTime: 1000 * 60,
    retry: false,
    meta: { disableToast: true },
  });
};
