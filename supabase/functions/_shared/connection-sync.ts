import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { decryptJson, encryptJson, legacyEncryptionKey } from "./secrets.ts";
import type { ConnectionHealthStatus } from "./connection-health.ts";

/**
 * Keeps the generic `connections` table and the legacy per-user
 * `github_connections` / `jira_connections` tables telling the same story.
 *
 * `connections` is the source of truth the UI, the onboarding agent and the
 * health sweep read. The legacy tables still hold the per-user token copy
 * that `github-api-proxy`, `github-mint-clone-credential`, `jira-api-proxy`
 * and the Jira webhook paths actually call providers with (see the scope note
 * in `legacy-mirror.ts` for why that copy stays per-user). Every write that
 * lands on one side goes through here so the other side follows.
 */

export const GITHUB_PROVIDER_IDS = ["github", "github-enterprise"] as const;
export const JIRA_PROVIDER_IDS = ["jira-cloud"] as const;

/**
 * One lock key for every Jira refresh, whichever store started it.
 *
 * Atlassian rotates the refresh token on every use. `connections-proxy` used
 * to lock on the connection id while `jira-api-proxy` locked on
 * `jira:<userId>` -- two different locks guarding the same token, so both
 * could redeem it at once and the loser's pair was dead. Keying both on the
 * authorising user serialises them.
 */
export function jiraRefreshLockKey(userId: string): string {
  return `jira:${userId}`;
}


export type ConnectionEventAction =
  | "connected"
  | "disconnected"
  | "refreshed"
  | "status_changed";

export interface ConnectionEventInput {
  orgId: string;
  providerId: string;
  instanceKey?: string;
  action: ConnectionEventAction;
  status?: string | null;
  actor?: string | null;
  detail?: Record<string, unknown>;
}

/**
 * Appends to the connection activity log (`connection_events`). Never throws
 * and never blocks the caller's real work: the log is a record, not a gate.
 * `detail` must never carry a credential -- only reasons and HTTP statuses.
 */
export async function recordConnectionEvents(
  admin: SupabaseClient,
  events: ConnectionEventInput[],
): Promise<void> {
  if (events.length === 0) return;
  try {
    await admin.from("connection_events").insert(
      events.map((event) => ({
        org_id: event.orgId,
        provider_id: event.providerId,
        instance_key: event.instanceKey ?? "default",
        action: event.action,
        status: event.status ?? null,
        actor: event.actor ?? null,
        detail: event.detail ?? {},
      })),
    );
  } catch {
    // Bookkeeping only.
  }
}

interface ChangedRow {
  org_id: string;
  provider_id: string;
  instance_key: string;
}

function statusEvents(
  rows: ChangedRow[] | null,
  status: string,
  detail?: Record<string, unknown>,
): ConnectionEventInput[] {
  return (rows ?? []).map((row) => ({
    orgId: row.org_id,
    providerId: row.provider_id,
    instanceKey: row.instance_key,
    action: "status_changed" as const,
    status,
    detail,
  }));
}

/**
 * Records a health verdict on the generic rows the given user authorised for
 * the given providers. Used by the legacy proxies, which only know the user,
 * not the connection id.
 *
 * Never throws: a status write is bookkeeping and must not turn a provider
 * error the caller is already handling into a 500.
 */
export async function markUserConnectionsStatus(
  admin: SupabaseClient,
  userId: string,
  providerIds: readonly string[],
  status: ConnectionHealthStatus,
  /** Why, for the activity log. Never a credential. */
  detail?: Record<string, unknown>,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    // `neq` makes this a no-op for rows already in that state, so a proxy
    // that sees the same 401 a hundred times logs one change, not a hundred.
    const { data } = await admin
      .from("connections")
      .update({
        status,
        updated_at: now,
      })
      .eq("created_by", userId)
      .in("provider_id", providerIds as string[])
      .neq("status", status)
      .select("org_id, provider_id, instance_key");
    await recordConnectionEvents(
      admin,
      statusEvents(data as ChangedRow[] | null, status, detail),
    );
  } catch {
    // Bookkeeping only.
  }
}

/** Same as above, for a caller that already has the connection id. */
export async function markConnectionStatus(
  admin: SupabaseClient,
  connectionId: string,
  status: ConnectionHealthStatus,
  /** Why, for the activity log. Never a credential. */
  detail?: Record<string, unknown>,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    const { data } = await admin
      .from("connections")
      .update({
        status,
        updated_at: now,
      })
      .eq("id", connectionId)
      .neq("status", status)
      .select("org_id, provider_id, instance_key");
    await recordConnectionEvents(
      admin,
      statusEvents(data as ChangedRow[] | null, status, detail),
    );
  } catch {
    // Bookkeeping only.
  }
}

export interface RotatedTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

/**
 * Writes a freshly rotated Jira token pair into the generic row(s) this user
 * authorised. Called by the legacy refresh paths so the Environment page's
 * `expires_at` and status stay true and the next `connections-proxy` call
 * does not redeem a refresh token that has already been spent.
 */
export async function writeJiraRotationToConnections(
  admin: SupabaseClient,
  userId: string,
  tokens: RotatedTokens,
): Promise<void> {
  try {
    const { data: rows } = await admin
      .from("connections")
      .select("id, encrypted_credentials")
      .eq("created_by", userId)
      .in("provider_id", JIRA_PROVIDER_IDS as unknown as string[]);
    for (const row of (rows ?? []) as {
      id: string;
      encrypted_credentials: string | null;
    }[]) {
      let existing: Record<string, string> = {};
      if (row.encrypted_credentials) {
        try {
          existing = await decryptJson(admin, row.encrypted_credentials);
        } catch {
          existing = {};
        }
      }
      const next: Record<string, string> = {
        ...existing,
        accessToken: tokens.accessToken,
        ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
      };
      await admin
        .from("connections")
        .update({
          encrypted_credentials: await encryptJson(admin, next),
          expires_at: tokens.expiresIn
            ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString()
            : null,
          status: "ok",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    }
  } catch {
    // The legacy write already succeeded; the generic row will be corrected
    // by the next probe or sweep.
  }
}

/**
 * The reverse: a refresh that started from `connections-proxy` (or the
 * health sweep) writes the rotated pair into `jira_connections`, which is
 * what `jira-api-proxy` and the webhook receiver read.
 */
export async function writeJiraRotationToLegacy(
  admin: SupabaseClient,
  userId: string,
  tokens: RotatedTokens,
): Promise<void> {
  try {
    const key = legacyEncryptionKey();
    const { data: access } = await admin.rpc("encrypt_github_token", {
      token: tokens.accessToken,
      encryption_key: key,
    });
    if (!access) return;
    let refresh: string | null = null;
    if (tokens.refreshToken) {
      const { data } = await admin.rpc("encrypt_github_token", {
        token: tokens.refreshToken,
        encryption_key: key,
      });
      refresh = (data as string | null) ?? null;
    }
    await admin
      .from("jira_connections")
      .update({
        encrypted_access_token: access,
        ...(refresh ? { encrypted_refresh_token: refresh } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  } catch {
    // Same reasoning as above.
  }
}

/**
 * Deletes the generic row(s) a legacy disconnect leaves behind. Without this
 * `github-disconnect` cleared the Settings page while the Environment page,
 * the onboarding agent and `connections-proxy` kept a working token.
 */
export async function deleteUserConnections(
  admin: SupabaseClient,
  userId: string,
  providerIds: readonly string[],
): Promise<void> {
  try {
    const { data } = await admin
      .from("connections")
      .delete()
      .eq("created_by", userId)
      .in("provider_id", providerIds as string[])
      .select("org_id, provider_id, instance_key");
    await recordConnectionEvents(
      admin,
      ((data as ChangedRow[] | null) ?? []).map((row) => ({
        orgId: row.org_id,
        providerId: row.provider_id,
        instanceKey: row.instance_key,
        action: "disconnected" as const,
        actor: userId,
      })),
    );
  } catch {
    // The legacy row is gone either way; a leftover generic row will show
    // as disconnected-at-next-probe rather than silently working.
  }
}

export interface LegacyToGenericInput {
  userId: string;
  providerId: "github" | "github-enterprise" | "jira-cloud";
  config: Record<string, string>;
  credentials: Record<string, string>;
  scopes: string[];
  displayName?: string | null;
  /** Seconds until the access token lapses, when the provider said. */
  expiresInSeconds?: number;
}

/**
 * The reverse of `mirrorToLegacy`: a connection made from Settings >
 * Connections (which still starts the legacy per-user OAuth flow) also lands
 * in the org-wide `connections` table, so the Environment page, the
 * onboarding agent and the health sweep see it.
 *
 * Only org admins/owners publish to the org table. `connections` is one row
 * per provider per org, so letting any member write it would let one
 * member's personal token replace the one the whole org's agents use -- the
 * same reason `connections-oauth-start` gates on `admin`. A plain member's
 * connection stays per-user, exactly as before.
 *
 * Best-effort: the legacy write already succeeded and is what the repo
 * picker reads. Returns why it skipped, for the redirect receipt.
 */
export async function mirrorLegacyToGeneric(
  admin: SupabaseClient,
  input: LegacyToGenericInput,
): Promise<{ mirrored: true } | { mirrored: false; reason: string }> {
  try {
    const { getCallerOrgId, requireOrgRole } = await import("./org.ts");
    const orgId = await getCallerOrgId(admin, input.userId);
    if (!orgId) return { mirrored: false, reason: "no_org" };
    if (!(await requireOrgRole(admin, input.userId, orgId, "admin"))) {
      return { mirrored: false, reason: "not_org_admin" };
    }

    const { fingerprint } = await import("./secrets.ts");
    const capability =
      input.providerId === "jira-cloud" ? "issue-tracker" : "source-control";
    const now = new Date().toISOString();
    const { error } = await admin.from("connections").upsert(
      {
        org_id: orgId,
        capability,
        provider_id: input.providerId,
        instance_key: "default",
        display_name: input.displayName ?? null,
        config: input.config,
        encrypted_credentials: await encryptJson(admin, input.credentials),
        credential_fingerprint: await fingerprint(input.credentials.accessToken ?? ""),
        redacted_summary: input.displayName ? { account: input.displayName } : {},
        requested_scopes: input.scopes,
        granted_scopes: input.scopes,
        status: "ok",
        last_probe_at: now,
        expires_at: input.expiresInSeconds
          ? new Date(Date.now() + input.expiresInSeconds * 1000).toISOString()
          : null,
        created_by: input.userId,
        updated_at: now,
      },
      { onConflict: "org_id,capability,provider_id,instance_key" },
    );
    if (error) return { mirrored: false, reason: error.message };
    await recordConnectionEvents(admin, [
      {
        orgId,
        providerId: input.providerId,
        action: "connected",
        status: "ok",
        actor: input.userId,
        detail: { via: "settings" },
      },
    ]);
    return { mirrored: true };
  } catch (error) {
    return { mirrored: false, reason: (error as Error)?.message ?? "unknown" };
  }
}
