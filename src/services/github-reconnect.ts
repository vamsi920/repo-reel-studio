/**
 * GitHub connection: one way in, and it heals itself.
 *
 * Why this exists (found 2026-11-25 in the user's GitHub security log):
 *
 * - The generic "Reconnect" flow (`connections-oauth-start` +
 *   `completeConnectionsOAuth`) sent GitHub a different `redirect_uri` in the
 *   token exchange than in the authorize step, so GitHub refused the exchange
 *   and nothing was saved (`?error=no_access_token`). GitHub had still minted
 *   a token on authorize, and it caps a user at 10 tokens per OAuth app and
 *   scope set (`max_for_app`), evicting the least recently used one. Every
 *   click on the banner's Reconnect therefore burned a token slot, evicted a
 *   working token, and fixed nothing: "GitHub needs to be reconnected" came
 *   back again and again.
 * - The legacy flow (`github-oauth-start` -> `github-oauth-callback`) has
 *   always worked, so every GitHub connect and reconnect now goes through it.
 *
 * And when GitHub does reject the stored token, Neo re-authorizes on its own:
 * for an app the user already approved, GitHub's authorize page redirects
 * straight back without asking anything, so the user sees a brief reload,
 * not a banner. At most once per `AUTO_RECONNECT_COOLDOWN_MS` per browser, so
 * a real problem (app access revoked on GitHub) cannot loop.
 */
import { supabase } from "#/lib/data-platform/client";

export const GITHUB_PROVIDER_IDS = ["github", "github-enterprise"] as const;
export const AUTO_RECONNECT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const AUTO_RECONNECT_AT_KEY = "neo-github-auto-reconnect-at";
const RETURN_PATH_KEY = "neo-github-reconnect-return";

export function isGithubProvider(providerId: string): boolean {
  return (GITHUB_PROVIDER_IDS as readonly string[]).includes(providerId);
}

/**
 * Starts the GitHub OAuth flow that works and returns GitHub's authorize URL.
 * `returnTo` is restored after the callback lands on Settings > Connections.
 */
export async function startGithubOAuth(options: {
  enterpriseHost?: string | null;
  returnTo?: string;
}): Promise<{ authorizeUrl: string }> {
  if (!supabase) throw new Error("not_configured");
  const { data, error } = await supabase.functions.invoke<{
    authorizeUrl: string;
  }>("github-oauth-start", {
    body: {
      ...(options.enterpriseHost
        ? { enterpriseHost: options.enterpriseHost }
        : {}),
      // So the callback returns to this site, not to production.
      appOrigin: window.location.origin,
    },
  });
  if (error || !data?.authorizeUrl) {
    throw new Error("github_oauth_start_failed");
  }
  if (options.returnTo) rememberReturnPath(options.returnTo);
  return data;
}

/** A return note older than this is ignored (the user gave up at GitHub). */
const RETURN_PATH_TTL_MS = 10 * 60 * 1000;

function rememberReturnPath(path: string): void {
  try {
    if (path.startsWith("/") && !path.startsWith("//")) {
      sessionStorage.setItem(
        RETURN_PATH_KEY,
        JSON.stringify({ path, at: Date.now() }),
      );
    }
  } catch {
    // Without storage the user simply stays on Settings > Connections.
  }
}

/** The path to go back to after a GitHub callback, consumed once. */
export function takeGithubReturnPath(now: number = Date.now()): string | null {
  try {
    const raw = sessionStorage.getItem(RETURN_PATH_KEY);
    sessionStorage.removeItem(RETURN_PATH_KEY);
    if (!raw) return null;
    const { path, at } = JSON.parse(raw) as { path?: unknown; at?: unknown };
    if (typeof path !== "string" || typeof at !== "number") return null;
    if (now - at > RETURN_PATH_TTL_MS) return null;
    return path.startsWith("/") && !path.startsWith("//") ? path : null;
  } catch {
    return null;
  }
}

/** True when the cooldown allows another automatic attempt, and claims it. */
export function claimAutoReconnect(now: number = Date.now()): boolean {
  try {
    const last = Number(localStorage.getItem(AUTO_RECONNECT_AT_KEY) ?? 0);
    if (Number.isFinite(last) && now - last < AUTO_RECONNECT_COOLDOWN_MS) {
      return false;
    }
    localStorage.setItem(AUTO_RECONNECT_AT_KEY, String(now));
    return true;
  } catch {
    // No storage means no loop guard, so never redirect automatically.
    return false;
  }
}
