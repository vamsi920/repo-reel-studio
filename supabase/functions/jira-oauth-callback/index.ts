import { completeConnectionsOAuth } from "../_shared/connections-oauth-complete.ts";
import { mirrorLegacyToGeneric } from "../_shared/connection-sync.ts";
import { originForRedirect, storedOriginFor } from "../_shared/legacy-redirect.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import {
  JIRA_TOKEN_URL,
  jiraOAuthCredentials,
  resolveFirstAccessibleResource,
} from "../_shared/jira.ts";

const STATE_TTL_MS = 10 * 60 * 1000;

function redirectTo(path: string, origin?: string): Response {
  const appOrigin = origin ?? originForRedirect(null);
  return new Response(null, {
    status: 302,
    headers: { Location: `${appOrigin}${path}` },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  // Offered to the generic flow FIRST, including provider errors; see the
  // matching comment in github-oauth-callback.
  if (state) {
    const generic = await completeConnectionsOAuth(req);
    if (generic) return generic;
  }

  const admin = createAdminClient();
  const origin = originForRedirect(
    await storedOriginFor(admin, "jira_oauth_state", state),
  );

  if (oauthError) {
    return redirectTo(
      `/settings/connections?error=${encodeURIComponent(oauthError)}`,
      origin,
    );
  }
  if (!code || !state) {
    return redirectTo("/settings/connections?error=missing_code_or_state", origin);
  }

  const { data: stateRow, error: stateError } = await admin
    .from("jira_oauth_state")
    .select("*")
    .eq("state", state)
    .maybeSingle();

  if (stateError || !stateRow) {
    return redirectTo("/settings/connections?error=invalid_state", origin);
  }

  // Single-use, delete on first read regardless of what happens below.
  await admin.from("jira_oauth_state").delete().eq("state", state);

  const stateAgeMs = Date.now() - new Date(stateRow.created_at).getTime();
  if (stateAgeMs > STATE_TTL_MS) {
    return redirectTo("/settings/connections?error=state_expired", origin);
  }

  let clientId: string;
  let clientSecret: string;
  try {
    ({ clientId, clientSecret } = jiraOAuthCredentials());
  } catch {
    return redirectTo("/settings/connections?error=oauth_not_configured", origin);
  }

  const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/jira-oauth-callback`;

  const tokenResponse = await fetch(JIRA_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      code_verifier: stateRow.code_verifier,
    }),
  });
  if (!tokenResponse.ok) {
    return redirectTo("/settings/connections?error=token_exchange_failed", origin);
  }
  const tokenJson = await tokenResponse.json();
  const accessToken: string | undefined = tokenJson.access_token;
  const refreshToken: string | undefined = tokenJson.refresh_token;
  if (!accessToken) {
    return redirectTo("/settings/connections?error=token_exchange_failed", origin);
  }
  const scopes: string[] =
    typeof tokenJson.scope === "string" && tokenJson.scope.length > 0
      ? tokenJson.scope.split(" ")
      : [];

  // Atlassian's tenant (cloudId) isn't user-supplied like GitHub Enterprise's
  // host -- it's resolved after token exchange, and a user may have several;
  // v1 takes the first, matching the one-connection shape github_connections
  // already established.
  const resource = await resolveFirstAccessibleResource(accessToken);
  if (!resource) {
    return redirectTo("/settings/connections?error=no_accessible_jira_site", origin);
  }

  const meResponse = await fetch("https://api.atlassian.com/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  const me = meResponse.ok ? await meResponse.json() : null;
  // `atlassian_account_id` is NOT NULL (see
  // supabase/migrations/20260825161919_jira_connections.sql) and nothing
  // downstream can re-resolve it later, so a failed/unresolved `/me` lookup
  // must abort the connection rather than silently persist an empty string
  // that reads as "connected" forever with no real account id -- the
  // sibling generic-flow mirror (`mirrorToLegacy` in
  // `_shared/legacy-mirror.ts`) already treats this exact failure as fatal
  // to its write; this direct legacy path used to do the opposite.
  const atlassianAccountId = me?.account_id as string | undefined;
  if (!atlassianAccountId) {
    return redirectTo("/settings/connections?error=jira_identity_unavailable", origin);
  }

  const encryptionKey = Deno.env.get("GITHUB_TOKEN_ENCRYPTION_KEY");
  if (!encryptionKey) {
    return redirectTo("/settings/connections?error=encryption_not_configured", origin);
  }

  const { data: encryptedAccessToken, error: encryptAccessError } =
    await admin.rpc("encrypt_github_token", {
      token: accessToken,
      encryption_key: encryptionKey,
    });
  if (encryptAccessError || !encryptedAccessToken) {
    return redirectTo("/settings/connections?error=encryption_failed", origin);
  }

  let encryptedRefreshToken: string | null = null;
  if (refreshToken) {
    const { data, error: encryptRefreshError } = await admin.rpc(
      "encrypt_github_token",
      { token: refreshToken, encryption_key: encryptionKey },
    );
    if (!encryptRefreshError && data) encryptedRefreshToken = data;
  }

  const { error: upsertError } = await admin.from("jira_connections").upsert({
    user_id: stateRow.user_id,
    cloud_id: resource.id,
    site_url: resource.url,
    site_name: resource.name,
    atlassian_account_id: atlassianAccountId,
    atlassian_email: (me?.email as string | undefined) ?? null,
    encrypted_access_token: encryptedAccessToken,
    encrypted_refresh_token: encryptedRefreshToken,
    scopes,
    updated_at: new Date().toISOString(),
  });
  if (upsertError) {
    return redirectTo("/settings/connections?error=save_failed", origin);
  }

  const published = await mirrorLegacyToGeneric(admin, {
    userId: stateRow.user_id as string,
    providerId: "jira-cloud",
    config: { cloudId: resource.id, siteUrl: resource.url },
    credentials: {
      accessToken,
      ...(refreshToken ? { refreshToken } : {}),
    },
    scopes,
    displayName: resource.name ?? null,
    // Atlassian access tokens last an hour; `connections.expires_at` is what
    // tells the sweep and `connections-proxy` when to refresh.
    expiresInSeconds:
      typeof tokenJson.expires_in === "number" ? tokenJson.expires_in : 3600,
  });
  void published;

  return redirectTo("/settings/connections?connected=jira", origin);
});
