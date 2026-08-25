import { createAdminClient } from "../_shared/supabase-admin.ts";
import {
  JIRA_TOKEN_URL,
  jiraOAuthCredentials,
  resolveFirstAccessibleResource,
} from "../_shared/jira.ts";

const STATE_TTL_MS = 10 * 60 * 1000;

function redirectTo(path: string): Response {
  const appOrigin = Deno.env.get("APP_ORIGIN");
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

  if (oauthError) {
    return redirectTo(
      `/settings/connections?error=${encodeURIComponent(oauthError)}`,
    );
  }
  if (!code || !state) {
    return redirectTo("/settings/connections?error=missing_code_or_state");
  }

  const admin = createAdminClient();

  const { data: stateRow, error: stateError } = await admin
    .from("jira_oauth_state")
    .select("*")
    .eq("state", state)
    .maybeSingle();

  if (stateError || !stateRow) {
    return redirectTo("/settings/connections?error=invalid_state");
  }

  // Single-use, delete on first read regardless of what happens below.
  await admin.from("jira_oauth_state").delete().eq("state", state);

  const stateAgeMs = Date.now() - new Date(stateRow.created_at).getTime();
  if (stateAgeMs > STATE_TTL_MS) {
    return redirectTo("/settings/connections?error=state_expired");
  }

  let clientId: string;
  let clientSecret: string;
  try {
    ({ clientId, clientSecret } = jiraOAuthCredentials());
  } catch {
    return redirectTo("/settings/connections?error=oauth_not_configured");
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
    return redirectTo("/settings/connections?error=token_exchange_failed");
  }
  const tokenJson = await tokenResponse.json();
  const accessToken: string | undefined = tokenJson.access_token;
  const refreshToken: string | undefined = tokenJson.refresh_token;
  if (!accessToken) {
    return redirectTo("/settings/connections?error=token_exchange_failed");
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
    return redirectTo("/settings/connections?error=no_accessible_jira_site");
  }

  const meResponse = await fetch("https://api.atlassian.com/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  const me = meResponse.ok ? await meResponse.json() : null;

  const encryptionKey = Deno.env.get("GITHUB_TOKEN_ENCRYPTION_KEY");
  if (!encryptionKey) {
    return redirectTo("/settings/connections?error=encryption_not_configured");
  }

  const { data: encryptedAccessToken, error: encryptAccessError } =
    await admin.rpc("encrypt_github_token", {
      token: accessToken,
      encryption_key: encryptionKey,
    });
  if (encryptAccessError || !encryptedAccessToken) {
    return redirectTo("/settings/connections?error=encryption_failed");
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
    atlassian_account_id: (me?.account_id as string | undefined) ?? "",
    atlassian_email: (me?.email as string | undefined) ?? null,
    encrypted_access_token: encryptedAccessToken,
    encrypted_refresh_token: encryptedRefreshToken,
    scopes,
    updated_at: new Date().toISOString(),
  });
  if (upsertError) {
    return redirectTo("/settings/connections?error=save_failed");
  }

  return redirectTo("/settings/connections?connected=jira");
});
