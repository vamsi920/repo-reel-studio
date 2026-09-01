import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, getCallerUserId } from "../_shared/supabase-admin.ts";
import { getCallerOrgId, requireOrgRole } from "../_shared/org.ts";
import { pkceChallengeFromVerifier, randomToken } from "../_shared/oauth.ts";
import { getConnectorManifest } from "../_shared/connector-registry/index.ts";
import { interpolatePath } from "../_shared/template.ts";

/**
 * Begins an OAuth authorization for any provider in the registry.
 *
 * Replaces github-oauth-start and jira-oauth-start with one implementation.
 * The differences between providers -- authorize URL, scopes, whether PKCE is
 * used, extra parameters like Atlassian's `audience`, and which environment
 * variables hold the client credentials -- are all manifest data.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const userId = await getCallerUserId(req);
  if (!userId) return jsonResponse({ error: "unauthorized" }, { status: 401 });

  let payload: {
    action?: string;
    providerId?: string;
    instanceKey?: string;
    config?: Record<string, string>;
    returnTo?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_body" }, { status: 400 });
  }

  if (payload.action !== "start") {
    return jsonResponse({ error: "unknown_action" }, { status: 400 });
  }

  const manifest = payload.providerId
    ? getConnectorManifest(payload.providerId)
    : undefined;
  if (!manifest) return jsonResponse({ error: "unknown_provider" }, { status: 400 });
  if (!manifest.oauth) {
    return jsonResponse({ error: "not_an_oauth_provider" }, { status: 400 });
  }

  const oauth = manifest.oauth as {
    authorizeUrlTemplate: string;
    scopes: string[];
    usesPkce: boolean;
    clientIdEnv: string;
    clientSecretEnv: string;
    extraAuthorizeParams?: Record<string, string>;
    callbackFunction?: string;
  };

  // A self-hosted variant is a different OAuth issuer with its own registered
  // application, which is why the env var names live in the manifest rather
  // than being derived from the capability.
  const clientId = Deno.env.get(oauth.clientIdEnv);
  if (!clientId || !Deno.env.get(oauth.clientSecretEnv)) {
    return jsonResponse(
      { error: "oauth_not_configured", requires: [oauth.clientIdEnv, oauth.clientSecretEnv] },
      { status: 500 },
    );
  }

  const admin = createAdminClient();
  const orgId = await getCallerOrgId(admin, userId);
  if (!orgId) return jsonResponse({ error: "no_org" }, { status: 403 });
  if (!(await requireOrgRole(admin, userId, orgId, "admin"))) {
    return jsonResponse({ error: "forbidden" }, { status: 403 });
  }

  const config = payload.config ?? {};
  const state = randomToken();
  const verifier = randomToken(64);

  const { error: stateError } = await admin.from("oauth_states").insert({
    state,
    org_id: orgId,
    user_id: userId,
    capability: manifest.capability,
    provider_id: manifest.id,
    instance_key: payload.instanceKey || "default",
    code_verifier: verifier,
    config,
    return_to: payload.returnTo ?? "/environment/connections",
  });
  if (stateError) {
    return jsonResponse({ error: "state_insert_failed" }, { status: 500 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  // Must match what is registered with the provider's OAuth application, not
  // what is convenient for us: a GitHub OAuth App has one callback URL and
  // rejects anything else with `redirect_uri_mismatch`. Providers that predate
  // this flow keep their original callback, which delegates back here.
  const redirectUri = `${supabaseUrl}/functions/v1/${
    oauth.callbackFunction ?? "connections-oauth-callback"
  }`;

  let authorizeBase: string;
  try {
    // Templated because a self-hosted instance's authorize endpoint lives on
    // the customer's own host, which arrives in `config`.
    authorizeBase = interpolatePath(oauth.authorizeUrlTemplate, {
      config,
      credentials: {},
      params: {},
    });
  } catch {
    return jsonResponse({ error: "missing_host_config" }, { status: 400 });
  }

  const url = new URL(authorizeBase);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", oauth.scopes.join(" "));
  url.searchParams.set("state", state);
  for (const [key, value] of Object.entries(oauth.extraAuthorizeParams ?? {})) {
    url.searchParams.set(key, value);
  }
  if (oauth.usesPkce) {
    url.searchParams.set("code_challenge", await pkceChallengeFromVerifier(verifier));
    url.searchParams.set("code_challenge_method", "S256");
  }

  return jsonResponse({ authorizeUrl: url.toString() });
});
