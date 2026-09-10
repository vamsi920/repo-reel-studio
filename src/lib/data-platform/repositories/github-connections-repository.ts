import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";

/**
 * Read-only from the browser: `github_connections` has no client-writable
 * RLS policy at all -- every write (connect, disconnect) goes through a
 * service-role Supabase Edge Function (supabase/functions/github-oauth-*,
 * github-disconnect). This repository only surfaces connection status for
 * display (Settings -> Connections, the local git-provider gate).
 */
export interface GithubConnectionStatus {
  githubUsername: string;
  enterpriseHost: string | null;
  connectedAt: string;
}

export interface GithubConnectionsRepository {
  getConnection(): Promise<GithubConnectionStatus | null>;
}

// A real fetch failure (RLS denial, network error, bad schema) previously
// returned null identically to "no connection exists", so a broken query
// here was invisible in the console -- see repository-identity.ts's
// `logFailure` for the same fix applied to that repository's silent
// swallow. `.maybeSingle()` itself reports no error for the legitimate
// "no row" case, so this only fires for genuine failures.
function logFailure(step: string, error: unknown): void {
  console.error(`[github-connections-repository] ${step} failed`, error);
}

class SupabaseGithubConnectionsRepository implements GithubConnectionsRepository {
  async getConnection(): Promise<GithubConnectionStatus | null> {
    if (!isSupabaseConfigured || !supabase) return null;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // Callers only reach here once `useSupabaseSession()` has already
    // confirmed a real session via `getSession()` (a local-storage read).
    // `getUser()` instead re-validates the token against the Supabase Auth
    // server, so it can independently come back empty on a transient
    // network hiccup even though the session is genuinely valid -- that
    // used to return null with zero signal, indistinguishable from "never
    // connected", which was the last unlogged silent-return path left in
    // this function (see the "Open Repository always empty" investigation).
    if (!user) {
      console.error(
        "[github-connections-repository] getConnection: getUser() returned no user despite an active session",
      );
      return null;
    }

    const { data, error } = await supabase
      .from("github_connections")
      .select("github_username, enterprise_host, connected_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      logFailure("getConnection", error);
      return null;
    }
    if (!data) return null;

    return {
      githubUsername: data.github_username as string,
      enterpriseHost: (data.enterprise_host as string | null) ?? null,
      connectedAt: data.connected_at as string,
    };
  }
}

export const githubConnectionsRepository: GithubConnectionsRepository =
  new SupabaseGithubConnectionsRepository();
