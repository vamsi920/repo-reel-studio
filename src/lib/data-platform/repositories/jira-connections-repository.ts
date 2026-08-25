import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";

/**
 * Read-only from the browser: `jira_connections` has no client-writable RLS
 * policy -- every write goes through a service-role Edge Function
 * (supabase/functions/jira-oauth-*, jira-disconnect). Mirrors
 * github-connections-repository.ts.
 */
export interface JiraConnectionStatus {
  siteName: string | null;
  siteUrl: string;
  atlassianEmail: string | null;
  connectedAt: string;
  /** Not secret -- needed to build API URLs for instant triggers' prompts. */
  cloudId: string;
}

export interface JiraConnectionsRepository {
  getConnection(): Promise<JiraConnectionStatus | null>;
}

class SupabaseJiraConnectionsRepository implements JiraConnectionsRepository {
  async getConnection(): Promise<JiraConnectionStatus | null> {
    if (!isSupabaseConfigured || !supabase) return null;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("jira_connections")
      .select("site_name, site_url, atlassian_email, connected_at, cloud_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error || !data) return null;

    return {
      siteName: (data.site_name as string | null) ?? null,
      siteUrl: data.site_url as string,
      atlassianEmail: (data.atlassian_email as string | null) ?? null,
      connectedAt: data.connected_at as string,
      cloudId: data.cloud_id as string,
    };
  }
}

export const jiraConnectionsRepository: JiraConnectionsRepository =
  new SupabaseJiraConnectionsRepository();
