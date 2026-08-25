import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";

export interface JiraIssueSummary {
  key: string;
  summary: string;
  status?: string;
  type?: string;
  priority?: string;
  updated?: string;
}

async function fetchRecentIssues(): Promise<JiraIssueSummary[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase.functions.invoke<{
    issues: JiraIssueSummary[];
  }>("jira-api-proxy", { body: { action: "issues" } });
  if (error || !data) return [];
  return data.issues;
}

export const useJiraIssues = (enabled: boolean) =>
  useQuery({
    queryKey: ["jira-issues"],
    queryFn: fetchRecentIssues,
    enabled,
    staleTime: 1000 * 30,
    retry: false,
    meta: { disableToast: true },
  });
