import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, getCallerUserId } from "../_shared/supabase-admin.ts";
import {
  githubAuthorizeUrl,
  githubOAuthCredentials,
  pkceChallengeFromVerifier,
  randomToken,
} from "../_shared/github.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const userId = await getCallerUserId(req);
  if (!userId) {
    return jsonResponse({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const enterpriseHost: string | null =
    typeof body.enterpriseHost === "string" && body.enterpriseHost.trim()
      ? body.enterpriseHost.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "")
      : null;

  let clientId: string;
  try {
    ({ clientId } = githubOAuthCredentials(enterpriseHost));
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "config_error" },
      { status: 400 },
    );
  }

  const state = randomToken();
  const codeVerifier = randomToken(48);
  const codeChallenge = await pkceChallengeFromVerifier(codeVerifier);

  const admin = createAdminClient();
  const { error: insertError } = await admin.from("github_oauth_state").insert({
    state,
    user_id: userId,
    enterprise_host: enterpriseHost,
    code_verifier: codeVerifier,
  });
  if (insertError) {
    return jsonResponse({ error: "failed_to_start_oauth" }, { status: 500 });
  }

  const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/github-oauth-callback`;

  const authorizeUrl = new URL(githubAuthorizeUrl(enterpriseHost));
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", "repo read:user");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  return jsonResponse({ authorizeUrl: authorizeUrl.toString() });
});
