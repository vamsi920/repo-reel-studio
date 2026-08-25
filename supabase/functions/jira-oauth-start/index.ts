import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, getCallerUserId } from "../_shared/supabase-admin.ts";
import {
  JIRA_AUTHORIZE_URL,
  jiraOAuthCredentials,
  pkceChallengeFromVerifier,
  randomToken,
} from "../_shared/jira.ts";

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

  let clientId: string;
  try {
    ({ clientId } = jiraOAuthCredentials());
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
  const { error: insertError } = await admin.from("jira_oauth_state").insert({
    state,
    user_id: userId,
    code_verifier: codeVerifier,
  });
  if (insertError) {
    return jsonResponse({ error: "failed_to_start_oauth" }, { status: 500 });
  }

  const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/jira-oauth-callback`;

  const authorizeUrl = new URL(JIRA_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("audience", "api.atlassian.com");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set(
    "scope",
    "read:jira-work read:jira-user offline_access",
  );
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("prompt", "consent");
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  return jsonResponse({ authorizeUrl: authorizeUrl.toString() });
});
