/**
 * CORS handling for the AgentOps collector.
 *
 * In production the frontend (neo.neodevex.com, on Netlify) and this
 * collector (neo-agent-server.fly.dev, on Fly) are different origins, so
 * every browser call is genuinely cross-origin — including the preflight
 * `OPTIONS` request Chrome sends before the actual call, because the
 * `X-Session-API-Key` header the UI authenticates with is not a "simple"
 * header. Without a matching `Access-Control-Allow-Origin` (and, for the
 * preflight, `Access-Control-Allow-Headers`/`-Methods`), the browser blocks
 * the response before the app ever sees it — the collector logs the request
 * as served, but the UI sees "Failed to fetch".
 */

/**
 * Allow-list entry matching any loopback origin (localhost, 127.0.0.1, [::1])
 * on any port. Local stacks serve the UI on whatever port the launcher picked
 * (8000 for `npm run dev` and the desktop app, 8010/8020 for side stacks,
 * 3000 for Vite alone), and the UI often addresses the backend as 127.0.0.1
 * while the page itself is on localhost -- a cross-origin call. Only a page
 * already running on this machine can have a loopback origin.
 */
export const LOOPBACK_ORIGINS = "loopback";

/** Same production origin `AUTOMATION_CORS_ORIGINS` defaults to in dev launchers. */
export const DEFAULT_ALLOWED_ORIGINS = [
  "https://neo.neodevex.com",
  LOOPBACK_ORIGINS,
];

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isLoopbackOrigin(origin) {
  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      LOOPBACK_HOSTS.has(url.hostname)
    );
  } catch {
    return false;
  }
}

/** Parses the `AGENTOPS_CORS_ORIGINS` env var (comma-separated), falling back to the default list. */
export function parseAllowedOrigins(envValue) {
  if (!envValue) return DEFAULT_ALLOWED_ORIGINS;
  const origins = envValue
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : DEFAULT_ALLOWED_ORIGINS;
}

/** Returns the origin to echo back, or null if the request's origin isn't allowed. */
export function resolveCorsOrigin(requestOrigin, allowedOrigins) {
  if (!requestOrigin) return null;
  if (allowedOrigins.includes("*")) return "*";
  if (allowedOrigins.includes(requestOrigin)) return requestOrigin;
  return allowedOrigins.includes(LOOPBACK_ORIGINS) &&
    isLoopbackOrigin(requestOrigin)
    ? requestOrigin
    : null;
}

/**
 * Sets CORS response headers for one request. Safe to call unconditionally
 * before routing — an unrecognized origin simply gets no
 * `Access-Control-Allow-Origin`, which the browser (not this server) then
 * blocks, same as today.
 */
export function applyCorsHeaders(res, requestOrigin, allowedOrigins) {
  const allowedOrigin = resolveCorsOrigin(requestOrigin, allowedOrigins);
  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    // Origin-dependent response — tell caches not to reuse it across origins.
    res.setHeader("Vary", "Origin");
  }
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Session-API-Key",
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
}
