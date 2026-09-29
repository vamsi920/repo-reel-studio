import {
  supabase,
  isSupabaseConfigured,
  getAuthUser,
} from "#/lib/data-platform/client";

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

export interface JiraConnectionStatusResult {
  connection: JiraConnectionStatus | null;
  /** True when the lookup itself failed (e.g. an INC-8-style auth-timing
   * glitch), as opposed to a legitimate "never connected" result -- see
   * `resolveOrgIdWithStatus` in `repository-identity.ts` for the same
   * distinction applied to org lookups. */
  hadError: boolean;
}

export interface JiraConnectionsRepository {
  getConnection(): Promise<JiraConnectionStatus | null>;
  getConnectionWithStatus(): Promise<JiraConnectionStatusResult>;
}

// Mirrors the same fix applied to github-connections-repository.ts's
// `logFailure`: a genuine fetch failure (RLS denial, network error) used to
// return null identically to "no connection exists", with no console signal
// at all -- indistinguishable from a real "not connected" state, which made
// a broken Jira connection invisible in the Connections settings UI and any
// Jira-trigger gate that reads it. `.maybeSingle()` itself reports no error
// for the legitimate "no row" case, so this only fires for genuine failures.
function logFailure(step: string, error: unknown): void {
  console.error(`[jira-connections-repository] ${step} failed`, error);
}

class SupabaseJiraConnectionsRepository implements JiraConnectionsRepository {
  async getConnectionWithStatus(): Promise<JiraConnectionStatusResult> {
    if (!isSupabaseConfigured || !supabase) {
      return { connection: null, hadError: false };
    }
    const {
      data: { user },
    } = await getAuthUser();
    // See github-connections-repository.ts's identical check: `getUser()`
    // re-validates the token against the Supabase Auth server (unlike the
    // local-storage `getSession()` read callers already gated on), so it can
    // independently come back empty on a transient network hiccup even
    // though the session is genuinely valid.
    if (!user) {
      console.error(
        "[jira-connections-repository] getConnection: getUser() returned no user despite an active session",
      );
      return { connection: null, hadError: true };
    }

    const { data, error } = await supabase
      .from("jira_connections")
      .select("site_name, site_url, atlassian_email, connected_at, cloud_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      logFailure("getConnection", error);
      return { connection: null, hadError: true };
    }
    if (!data) return { connection: null, hadError: false };

    return {
      connection: {
        siteName: (data.site_name as string | null) ?? null,
        siteUrl: data.site_url as string,
        atlassianEmail: (data.atlassian_email as string | null) ?? null,
        connectedAt: data.connected_at as string,
        cloudId: data.cloud_id as string,
      },
      hadError: false,
    };
  }

  async getConnection(): Promise<JiraConnectionStatus | null> {
    const { connection } = await this.getConnectionWithStatus();
    return connection;
  }
}

export const jiraConnectionsRepository: JiraConnectionsRepository =
  new SupabaseJiraConnectionsRepository();
