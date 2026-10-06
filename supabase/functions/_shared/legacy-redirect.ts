import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  DEFAULT_APP_ORIGIN,
  isAllowedAppOrigin,
  parseAppOriginAllowlist,
  resolveAppOrigin,
} from "./connection-health.ts";

/**
 * Origin handling for the legacy per-user OAuth flows
 * (`github-oauth-*`, `jira-oauth-*`), which Settings > Connections still uses.
 *
 * They used to redirect to the one hard-coded `APP_ORIGIN`, so connecting
 * from localhost, Docker or the desktop app ended on production. The start
 * functions now store the origin the user started from (validated against the
 * same allowlist as the generic flow) and the callbacks send them back to it.
 */
function allowlist(): { list: string[]; fallback: string } {
  const fallback = Deno.env.get("APP_ORIGIN") ?? DEFAULT_APP_ORIGIN;
  return {
    list: parseAppOriginAllowlist(Deno.env.get("APP_ORIGIN_ALLOWLIST"), fallback),
    fallback,
  };
}

/** The origin to persist at start time, or null for "use the default". */
export function originToStore(candidate: unknown): string | null {
  if (typeof candidate !== "string") return null;
  const { list } = allowlist();
  return isAllowedAppOrigin(candidate, list) ? candidate.replace(/\/$/, "") : null;
}

/** Origin for a legacy callback, given the stored value (possibly absent). */
export function originForRedirect(stored: string | null | undefined): string {
  const { list, fallback } = allowlist();
  return resolveAppOrigin(stored, list, fallback);
}

/** Reads the stored origin without consuming the state row. */
export async function storedOriginFor(
  admin: SupabaseClient,
  table: "github_oauth_state" | "jira_oauth_state",
  state: string | null,
): Promise<string | null> {
  if (!state) return null;
  try {
    const { data } = await admin
      .from(table)
      .select("app_origin")
      .eq("state", state)
      .maybeSingle();
    return (data?.app_origin as string | null | undefined) ?? null;
  } catch {
    return null;
  }
}
