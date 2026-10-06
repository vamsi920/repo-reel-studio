/**
 * Pure rules for turning a provider's answer into a connection status, and
 * for deciding where an OAuth round-trip is allowed to land.
 *
 * Kept dependency-free (no Supabase client, no Deno globals) so the same
 * module is unit-tested from Vitest and imported by every Edge Function that
 * talks to a provider. One classifier means the Environment page, the
 * Settings page, the onboarding agent and the health sweep can never disagree
 * about whether a connection "needs reconnecting".
 */

export type ConnectionHealthStatus =
  | "ok"
  | "degraded"
  | "error"
  | "expired"
  | "revoked";

/**
 * A refresh-token grant that came back non-OK.
 *
 * Only a definitive rejection (`invalid_grant`, or a 400/401 from the token
 * endpoint) means the refresh token is dead and the user has to re-consent.
 * A 5xx or a 429 is the provider having a bad minute: flipping the
 * connection to `expired` on those used to send people through a full
 * re-consent for an outage that would have cleared on its own. `null` means
 * "leave the status alone, try again later".
 */
export function classifyRefreshFailure(
  httpStatus: number,
  body: unknown,
): ConnectionHealthStatus | null {
  const errorCode =
    body && typeof body === "object" && "error" in body
      ? String((body as { error: unknown }).error)
      : "";
  if (errorCode === "invalid_grant" || errorCode === "unauthorized_client") {
    return "expired";
  }
  if (httpStatus === 400 || httpStatus === 401) return "expired";
  return null;
}

/**
 * A normal API call (or a probe) that came back non-OK.
 *
 * - 401 on a provider that can refresh means the access token lapsed and the
 *   refresh did not save it: `expired`.
 * - 401 on a provider that cannot refresh (GitHub OAuth apps, API keys) means
 *   the credential was revoked or rotated upstream: `revoked`.
 * - 403 is usually "authenticated but not allowed" (missing scope, SSO not
 *   authorised): `degraded`, because reconnecting with the right scopes is
 *   the fix but the token itself still works for something.
 * - Anything else is not an auth signal and must not change the status.
 */
export function classifyApiAuthFailure(
  httpStatus: number,
  refreshable: boolean,
): ConnectionHealthStatus | null {
  if (httpStatus === 401) return refreshable ? "expired" : "revoked";
  if (httpStatus === 403) return "degraded";
  return null;
}

/** Statuses the user has to act on by reconnecting. */
export function statusNeedsReconnect(status: string | null | undefined): boolean {
  return status === "expired" || status === "revoked";
}

export const DEFAULT_APP_ORIGIN = "https://neo.neodevex.com";

/**
 * Origins an OAuth callback may redirect back to.
 *
 * The callback runs on Supabase, not in the app, so it has to be told where
 * the user started -- localhost dev, the Docker image, the desktop app's
 * local ingress, a deploy preview, or production. Accepting any origin the
 * browser claims would make the callback an open redirect carrying
 * `?connected=` receipts, so the browser's claim is checked against:
 *
 * - every entry in `APP_ORIGIN_ALLOWLIST` (comma-separated; an entry may use
 *   a leading `*.` wildcard for one host label, e.g. `https://*.netlify.app`
 *   is NOT allowed by default -- add your own site's preview pattern),
 * - the deployment's own `APP_ORIGIN`,
 * - loopback hosts on any port (`localhost`, `127.0.0.1`, `[::1]`,
 *   `*.localhost`), which is what dev, Docker and Electron all serve from.
 *   Loopback is safe to allow: a redirect there can only reach a server on
 *   the user's own machine.
 */
export function isAllowedAppOrigin(
  candidate: string,
  allowlist: string[],
): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  // An origin, not a URL: no path, credentials, query or fragment allowed.
  if (url.username || url.password) return false;
  const origin = url.origin;
  if (candidate.replace(/\/$/, "") !== origin) return false;

  const host = url.hostname;
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host.endsWith(".localhost")
  ) {
    return true;
  }

  // Non-loopback origins must be https.
  if (url.protocol !== "https:") return false;

  return allowlist.some((entry) => {
    const pattern = entry.trim().replace(/\/$/, "");
    if (!pattern) return false;
    if (pattern === origin) return true;
    const wildcard = pattern.match(/^https:\/\/\*\.(.+)$/);
    if (!wildcard) return false;
    const suffix = `.${wildcard[1]}`;
    if (!host.endsWith(suffix)) return false;
    // Exactly one label in place of the `*`.
    const label = host.slice(0, -suffix.length);
    return label.length > 0 && !label.includes(".");
  });
}

/** Parses `APP_ORIGIN_ALLOWLIST` plus the deployment's own origin. */
export function parseAppOriginAllowlist(
  rawAllowlist: string | undefined,
  appOrigin: string,
): string[] {
  const entries = (rawAllowlist ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return [appOrigin, ...entries];
}

/**
 * The origin to send the user back to: the one stored with the OAuth state
 * when it is still allowed, otherwise the deployment default.
 */
export function resolveAppOrigin(
  stored: string | null | undefined,
  allowlist: string[],
  fallback: string,
): string {
  if (stored && isAllowedAppOrigin(stored, allowlist)) return stored;
  return fallback;
}

/**
 * `return_to` is a path inside the app, optionally under a base path
 * (`/canvas/environment/setup`). Anything that is not a plain absolute path
 * -- a full URL, a protocol-relative `//evil.com` -- falls back, so the
 * stored value cannot be used to leave the allowed origin.
 */
export function safeReturnPath(
  value: string | null | undefined,
  fallback: string,
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;
  return value;
}

/**
 * Status to store after a connector probe. A probe that failed on auth is
 * classified exactly like a failed API call, so "Test" on the Environment
 * page, the health sweep and the proxies all reach the same verdict.
 */
export function statusFromProbe(
  result: {
    ok: boolean;
    missingScopes?: string[];
    remediation?: { codeKey: string };
  },
  refreshable: boolean,
): ConnectionHealthStatus {
  if (result.ok) {
    return (result.missingScopes ?? []).length > 0 ? "degraded" : "ok";
  }
  const code = result.remediation?.codeKey;
  if (code === "PROBE$REMEDIATION_UNAUTHORIZED") {
    return refreshable ? "expired" : "revoked";
  }
  if (code === "PROBE$REMEDIATION_FORBIDDEN") return "degraded";
  return "error";
}

/** A provider's error body, or null when it is empty or not JSON. */
export async function readJsonSafely(response: {
  json?: () => Promise<unknown>;
}): Promise<unknown> {
  try {
    return typeof response.json === "function" ? await response.json() : null;
  } catch {
    return null;
  }
}
