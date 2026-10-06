import {
  buildAgentCanvasPath,
  getAgentCanvasBasePath,
} from "#/utils/base-path";

/**
 * Helpers for the browser half of an OAuth round-trip.
 *
 * The provider redirects to a Supabase Edge Function, which redirects back
 * to `appOrigin + returnTo`. Both halves have to be right for the user to
 * land where they started: the origin (localhost vs Docker vs production) and
 * the path, including any `VITE_BASE_PATH` such as `/canvas`.
 */

const OAUTH_PENDING_STORAGE_KEY = "neo-oauth-pending";
const OAUTH_PENDING_MAX_AGE_MS = 15 * 60_000;
const DEFAULT_RETURN_PATH = "/environment/connections";

/**
 * A path inside this app, base path included. Callers pass either a
 * route-relative path ("/environment/setup") or the browser's current
 * location (which already carries the base path); both must resolve to the
 * same thing, and neither may be double-prefixed.
 */
export function resolveOAuthReturnPath(returnTo: string | undefined): string {
  const path = returnTo?.startsWith("/") ? returnTo : DEFAULT_RETURN_PATH;
  const base = getAgentCanvasBasePath();
  if (base && (path === base || path.startsWith(`${base}/`))) return path;
  return buildAgentCanvasPath(path);
}

/** Records that this tab is waiting on an OAuth redirect. */
export function markOAuthPending(providerId: string): void {
  try {
    sessionStorage.setItem(
      OAUTH_PENDING_STORAGE_KEY,
      JSON.stringify({ providerId, at: Date.now() }),
    );
  } catch {
    // Storage can be blocked (private windows); the receipt is still handled
    // on the routes that parse it themselves.
  }
}

/**
 * True when a `?connected=` / `?error=` receipt on an arbitrary route really
 * belongs to an OAuth flow this tab started. `error` is a common query
 * parameter, so an unmarked one must never be swallowed and toasted.
 */
export function hasPendingOAuth(): boolean {
  try {
    const raw = sessionStorage.getItem(OAUTH_PENDING_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { at?: number };
    return (
      typeof parsed.at === "number" &&
      Date.now() - parsed.at < OAUTH_PENDING_MAX_AGE_MS
    );
  } catch {
    return false;
  }
}

export function clearOAuthPending(): void {
  try {
    sessionStorage.removeItem(OAUTH_PENDING_STORAGE_KEY);
  } catch {
    // See markOAuthPending.
  }
}
