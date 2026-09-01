import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { encryptionKey } from "./secrets.ts";

/**
 * Mirrors a generic `connections` row into the per-vendor legacy table.
 *
 * Without this, connecting GitHub through the onboarding flow leaves the repo
 * picker silently empty: `github-api-proxy`, `github-mint-clone-credential`
 * and `useGithubConnection` all read `github_connections`, and
 * `GitService` returns an EMPTY page (not an error) when it believes there is
 * no connection. "Connected" and "usable" would diverge with nothing on
 * screen to explain why.
 *
 * TWO ENCRYPTION FORMATS, AND THEY ARE NOT INTERCHANGEABLE.
 * `_shared/secrets.ts` stores a JSON *object* (`{"accessToken":"ghp_..."}`)
 * because a generic connection can have several secret fields. The legacy
 * tables predate that and store a *bare* token. Mirroring the JSON form would
 * make `github-api-proxy` send `Authorization: Bearer {"accessToken":"ghp_…"}`
 * -- a 401 that looks like a bad credential rather than a bug here. So the
 * mirror re-encrypts the bare string with `encrypt_github_token`, which is the
 * function the legacy readers decrypt with.
 *
 * SCOPE MISMATCH, DELIBERATELY NOT PAPERED OVER.
 * `connections` is org-scoped; the legacy tables are keyed by `user_id`. This
 * mirrors only the row for the person who actually authorised, and never fans
 * out across `org_members` -- doing so would hand one person's token to every
 * colleague's session, and `github-mint-clone-credential` would then mint it
 * into any member's agent sandbox. A teammate who has not connected their own
 * account sees an honest prompt in the UI instead.
 */

export type LegacyMirrorOutcome =
  | { mirrored: "github" | "jira" }
  | { mirrored: null; reason: string };

async function encryptBare(
  admin: SupabaseClient,
  token: string,
): Promise<string> {
  const { data, error } = await admin.rpc("encrypt_github_token", {
    token,
    encryption_key: encryptionKey(),
  });
  if (error || !data) throw new Error("legacy_encrypt_failed");
  return data as string;
}

export interface LegacyMirrorInput {
  providerId: string;
  userId: string;
  config: Record<string, string>;
  /** Plaintext, in-function only. Never returned or logged. */
  credentials: Record<string, string>;
  scopes: string[];
  /** Identity resolved during the OAuth exchange, when available. */
  identity?: { id?: string | number; name?: string; email?: string };
}

export async function mirrorToLegacy(
  admin: SupabaseClient,
  input: LegacyMirrorInput,
): Promise<LegacyMirrorOutcome> {
  const accessToken = input.credentials.accessToken;
  if (!accessToken) return { mirrored: null, reason: "no_access_token" };

  if (input.providerId === "github" || input.providerId === "github-enterprise") {
    // Both columns are NOT NULL in `20260824130000_github_connections.sql`, so
    // a missing identity has to abort the mirror rather than write a
    // half-formed row the proxy would then trip over.
    const githubUserId = Number(input.identity?.id);
    const githubUsername = input.identity?.name;
    if (!Number.isFinite(githubUserId) || !githubUsername) {
      return { mirrored: null, reason: "identity_unavailable" };
    }

    const { error } = await admin.from("github_connections").upsert(
      {
        user_id: input.userId,
        github_user_id: githubUserId,
        github_username: githubUsername,
        enterprise_host: input.config.enterpriseHost ?? null,
        encrypted_access_token: await encryptBare(admin, accessToken),
        scopes: input.scopes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) return { mirrored: null, reason: error.message };
    return { mirrored: "github" };
  }

  if (input.providerId === "jira-cloud") {
    const cloudId = input.config.cloudId;
    const siteUrl = input.config.siteUrl;
    if (!cloudId || !siteUrl) {
      return { mirrored: null, reason: "site_unresolved" };
    }

    // `atlassian_account_id` is NOT NULL and is not part of the
    // accessible-resources payload, so it needs its own lookup. A failure here
    // is not fatal to the primary connection -- the mirror is simply skipped.
    let accountId: string | undefined;
    try {
      const response = await fetch("https://api.atlassian.com/me", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
      if (response.ok) {
        const me = (await response.json()) as {
          account_id?: string;
          email?: string;
        };
        accountId = me.account_id;
        if (me.email) input.identity = { ...input.identity, email: me.email };
      }
    } catch {
      accountId = undefined;
    }
    if (!accountId) return { mirrored: null, reason: "account_unresolved" };

    const { error } = await admin.from("jira_connections").upsert(
      {
        user_id: input.userId,
        cloud_id: cloudId,
        site_url: siteUrl,
        site_name: input.identity?.name ?? null,
        atlassian_account_id: accountId,
        atlassian_email: input.identity?.email ?? null,
        encrypted_access_token: await encryptBare(admin, accessToken),
        // The access token expires in about an hour; `jira-api-proxy` and the
        // webhook receiver both refresh from this one, so omitting it would
        // leave the mirrored connection dead within the hour.
        encrypted_refresh_token: input.credentials.refreshToken
          ? await encryptBare(admin, input.credentials.refreshToken)
          : null,
        scopes: input.scopes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) return { mirrored: null, reason: error.message };
    return { mirrored: "jira" };
  }

  return { mirrored: null, reason: "no_legacy_table" };
}

/** Removes the mirrored row when a generic connection is deleted. */
export async function unmirrorFromLegacy(
  admin: SupabaseClient,
  providerId: string,
  userId: string,
): Promise<void> {
  const table =
    providerId === "github" || providerId === "github-enterprise"
      ? "github_connections"
      : providerId === "jira-cloud"
        ? "jira_connections"
        : null;
  if (!table) return;
  await admin.from(table).delete().eq("user_id", userId);
}
