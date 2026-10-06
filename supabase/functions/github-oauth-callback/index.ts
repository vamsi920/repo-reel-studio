import { completeConnectionsOAuth } from "../_shared/connections-oauth-complete.ts";
import { mirrorLegacyToGeneric } from "../_shared/connection-sync.ts";
import { originForRedirect, storedOriginFor } from "../_shared/legacy-redirect.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import {
  assertEnterpriseHostAllowed,
  githubApiBaseUrl,
  githubOAuthCredentials,
  githubTokenUrl,
} from "../_shared/github.ts";

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

  // Offered to the generic flow FIRST, including provider errors: a user who
  // denies consent on a generic flow comes back with `?error=` and the same
  // `state`, and only the generic completer knows where they started.
  if (state) {
    const generic = await completeConnectionsOAuth(req);
    if (generic) return generic;
  }

  const admin = createAdminClient();
  const origin = originForRedirect(
    await storedOriginFor(admin, "github_oauth_state", state),
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
    .from("github_oauth_state")
    .select("*")
    .eq("state", state)
    .maybeSingle();

  if (stateError || !stateRow) {
    return redirectTo("/settings/connections?error=invalid_state", origin);
  }

  // Always delete on first use, even if something below fails -- a state
  // row is single-use, and leaving it around after a failed attempt just
  // extends the window an attacker (or a retried double-click) could use it.
  await admin.from("github_oauth_state").delete().eq("state", state);

  const stateAgeMs = Date.now() - new Date(stateRow.created_at).getTime();
  if (stateAgeMs > STATE_TTL_MS) {
    return redirectTo("/settings/connections?error=state_expired", origin);
  }

  const enterpriseHost: string | null = stateRow.enterprise_host;

  // Defense in depth: `github-oauth-start` already rejects a blocked host
  // before it's ever stored, but this is the call that actually sends the
  // enterprise client secret to `enterpriseHost` -- it must never trust that
  // upstream check alone.
  try {
    assertEnterpriseHostAllowed(enterpriseHost);
  } catch {
    return redirectTo("/settings/connections?error=invalid_enterprise_host", origin);
  }

  let clientId: string;
  let clientSecret: string;
  try {
    ({ clientId, clientSecret } = githubOAuthCredentials(enterpriseHost));
  } catch {
    return redirectTo("/settings/connections?error=oauth_not_configured", origin);
  }

  const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/github-oauth-callback`;

  const tokenResponse = await fetch(githubTokenUrl(enterpriseHost), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
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
  if (!accessToken) {
    return redirectTo("/settings/connections?error=token_exchange_failed", origin);
  }
  const scopes: string[] =
    typeof tokenJson.scope === "string" && tokenJson.scope.length > 0
      ? tokenJson.scope.split(",")
      : [];

  const userResponse = await fetch(`${githubApiBaseUrl(enterpriseHost)}/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "neodevex-github-connections",
    },
  });
  if (!userResponse.ok) {
    return redirectTo("/settings/connections?error=github_user_lookup_failed", origin);
  }
  const githubUser = await userResponse.json();

  const encryptionKey = Deno.env.get("GITHUB_TOKEN_ENCRYPTION_KEY");
  if (!encryptionKey) {
    return redirectTo("/settings/connections?error=encryption_not_configured", origin);
  }

  const { data: encrypted, error: encryptError } = await admin.rpc(
    "encrypt_github_token",
    { token: accessToken, encryption_key: encryptionKey },
  );
  if (encryptError || !encrypted) {
    return redirectTo("/settings/connections?error=encryption_failed", origin);
  }

  const { error: upsertError } = await admin.from("github_connections").upsert({
    user_id: stateRow.user_id,
    github_user_id: githubUser.id,
    github_username: githubUser.login,
    enterprise_host: enterpriseHost,
    encrypted_access_token: encrypted,
    scopes,
    updated_at: new Date().toISOString(),
  });
  if (upsertError) {
    return redirectTo("/settings/connections?error=save_failed", origin);
  }

  // Publish to the org-wide table too (org admins only; see
  // `mirrorLegacyToGeneric`), so the Environment page and onboarding agent
  // see what was just connected here.
  const published = await mirrorLegacyToGeneric(admin, {
    userId: stateRow.user_id as string,
    providerId: enterpriseHost ? "github-enterprise" : "github",
    config: enterpriseHost ? { enterpriseHost } : {},
    credentials: { accessToken },
    scopes,
    displayName: githubUser.login as string,
  });
  void published;

  return redirectTo("/settings/connections?connected=github", origin);
});
