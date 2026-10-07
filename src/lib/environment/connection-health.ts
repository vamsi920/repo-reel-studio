import type { ConnectionRecord } from "#/lib/data-platform/repositories/connections-repository";
import type { ConnectorManifest } from "#/lib/environment/types/capability";

/**
 * "The user has to act" for a connection, in one place.
 *
 * `expired` and `revoked` are written by the server (refresh rejected, API
 * 401, the hourly sweep); `error` counts only when the failing probe pointed
 * at the credential itself, because an `error` from an unreachable host is
 * not fixed by re-consenting.
 */
const AUTH_REMEDIATION_CODE = "PROBE$REMEDIATION_UNAUTHORIZED";

export function needsReconnect(
  connection: Pick<ConnectionRecord, "status" | "lastProbe"> | null | undefined,
): boolean {
  if (!connection) return false;
  if (connection.status === "expired" || connection.status === "revoked") {
    return true;
  }
  return (
    connection.status === "error" &&
    connection.lastProbe?.remediation?.codeKey === AUTH_REMEDIATION_CODE
  );
}

/** Config values the OAuth start function needs back (host, tenant, ...). */
export function oauthConfigFor(
  connection: Pick<ConnectionRecord, "config">,
): Record<string, string> {
  const config: Record<string, string> = {};
  for (const [key, value] of Object.entries(connection.config ?? {})) {
    if (typeof value === "string") config[key] = value;
  }
  return config;
}

/**
 * OAuth providers reconnect by repeating the consent redirect (the server
 * upserts over the same row); everything else needs the credential form
 * again, pre-filled with the stored non-secret config.
 */
export function reconnectKind(manifest: ConnectorManifest): "oauth" | "form" {
  return manifest.oauth ? "oauth" : "form";
}

/** How far ahead to warn about a token that will lapse on its own. */
export const EXPIRY_WARNING_WINDOW_MS = 3 * 24 * 60 * 60_000;

/**
 * When a still-working connection will stop working by itself, if soon.
 *
 * Refreshable OAuth tokens (Jira) are renewed by the hourly health check
 * before they lapse, so their short `expiresAt` is not news and returns null.
 * Only tokens nothing can renew -- the user has to act -- are warned about.
 */
export function expiresSoon(
  connection: Pick<ConnectionRecord, "status" | "lastProbe" | "expiresAt">,
  manifest: Pick<ConnectorManifest, "oauth"> | undefined,
  now: number = Date.now(),
): Date | null {
  if (!connection.expiresAt || needsReconnect(connection)) return null;
  if (manifest?.oauth?.refreshable) return null;
  const at = new Date(connection.expiresAt);
  const remaining = at.getTime() - now;
  if (Number.isNaN(remaining) || remaining <= 0) return null;
  return remaining <= EXPIRY_WARNING_WINDOW_MS ? at : null;
}
