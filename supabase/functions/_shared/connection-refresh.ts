import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { encryptJson } from "./secrets.ts";
import { holdsAdvisoryLock } from "./advisory-lock.ts";
import { assertHostAllowed, interpolatePath } from "./template.ts";
import { classifyRefreshFailure, readJsonSafely } from "./connection-health.ts";
import {
  jiraRefreshLockKey,
  markConnectionStatus,
  recordConnectionEvents,
  writeJiraRotationToLegacy,
} from "./connection-sync.ts";

/**
 * Refreshes an expiring OAuth token on a generic `connections` row.
 *
 * Shared by `connections-proxy` (before every call), `environment-probe`
 * (before every probe, so a token that merely lapsed is refreshed instead of
 * being reported as broken) and `connections-health-sweep` (ahead of expiry,
 * so nobody meets a lapsed token at all).
 *
 * Serialised through a Postgres advisory lock. Atlassian rotates the refresh
 * token on every use, so two concurrent refreshes race and the loser writes
 * back a token the provider has already invalidated. Jira rows lock on the
 * same key the legacy `jira-api-proxy` uses, so the two stores can no longer
 * redeem the same refresh token at once.
 */
export async function refreshIfNeeded(
  admin: SupabaseClient,
  connection: Record<string, unknown>,
  manifest: { id: string; oauth?: Record<string, unknown> },
  credentials: Record<string, string>,
  options: { windowMs?: number } = {},
): Promise<Record<string, string>> {
  const oauth = manifest.oauth as
    | {
        tokenUrlTemplate: string;
        refreshable: boolean;
        clientIdEnv: string;
        clientSecretEnv: string;
      }
    | undefined;
  if (!oauth?.refreshable || !credentials.refreshToken) return credentials;

  // An unknown expiry (the provider omitted `expires_in` on the original
  // exchange, or a manually-set credential) is not the same as "expiring
  // soon": treating it as the latter forced a refresh -- and an advisory
  // lock acquisition -- on every single proxied call for that connection,
  // even when the current access token was still perfectly valid.
  const expiresAt = connection.expires_at as string | null;
  if (!expiresAt) return credentials;
  const soon = Date.now() + (options.windowMs ?? 60_000);
  if (new Date(expiresAt).getTime() > soon) return credentials;

  const connectionId = connection.id as string;
  const createdBy = connection.created_by as string | null;
  const isJira = manifest.id === "jira-cloud";
  const lockKey = isJira && createdBy ? jiraRefreshLockKey(createdBy) : connectionId;

  const { data: gotLock, error: lockError } = await admin.rpc(
    "environment_try_advisory_lock",
    { lock_key: lockKey },
  );
  if (!holdsAdvisoryLock(gotLock, lockError)) {
    // Either another request is refreshing right now, or the lock RPC itself
    // failed -- in both cases we cannot confirm exclusive ownership, so we
    // must not refresh unserialised. The current token is still valid for at
    // least the next minute either way.
    return credentials;
  }

  try {
    const clientId = Deno.env.get(oauth.clientIdEnv);
    const clientSecret = Deno.env.get(oauth.clientSecretEnv);
    if (!clientId || !clientSecret) return credentials;

    const config = (connection.config as Record<string, string>) ?? {};
    const tokenUrl = interpolatePath(oauth.tokenUrlTemplate, {
      config,
      credentials: {},
      params: {},
    });

    // A connection whose stored `config` resolves to a blocked network must
    // never reach a refresh POST carrying the client secret and a live
    // refresh token.
    try {
      assertHostAllowed(tokenUrl, manifest.id);
    } catch {
      return credentials;
    }

    let response: Response;
    try {
      response = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: credentials.refreshToken,
        }),
      });
    } catch {
      // Network blip: not a verdict on the token.
      return credentials;
    }

    if (!response.ok) {
      // Only a definitive rejection marks the connection expired; a 5xx used
      // to send people through a full re-consent for a provider outage.
      const verdict = classifyRefreshFailure(
        response.status,
        await readJsonSafely(response),
      );
      if (verdict) {
        await markConnectionStatus(admin, connectionId, verdict, {
          reason: "refresh_rejected",
          httpStatus: response.status,
        });
      }
      return credentials;
    }

    const token = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!token.access_token) return credentials;

    const next: Record<string, string> = {
      ...credentials,
      accessToken: token.access_token,
    };
    if (token.refresh_token) next.refreshToken = token.refresh_token;

    await admin
      .from("connections")
      .update({
        encrypted_credentials: await encryptJson(admin, next),
        expires_at: token.expires_in
          ? new Date(Date.now() + token.expires_in * 1000).toISOString()
          : null,
        status: "ok",
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId);

    if (connection.org_id) {
      await recordConnectionEvents(admin, [
        {
          orgId: connection.org_id as string,
          providerId: connection.provider_id as string,
          instanceKey: (connection.instance_key as string) ?? "default",
          action: "refreshed",
          status: "ok",
        },
      ]);
    }

    if (isJira && createdBy) {
      await writeJiraRotationToLegacy(admin, createdBy, {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
      });
    }

    return next;
  } finally {
    await admin.rpc("environment_advisory_unlock", { lock_key: lockKey });
  }
}
