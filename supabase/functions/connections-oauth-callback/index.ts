import { corsHeaders } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { encryptJson, fingerprint } from "../_shared/secrets.ts";
import { OAUTH_STATE_TTL_MS } from "../_shared/oauth.ts";
import { getConnectorManifest } from "../_shared/connector-registry/index.ts";
import { interpolatePath, resolveBaseUrl } from "../_shared/template.ts";
import { runConnectorProbe } from "../_shared/probe-runner.ts";

/**
 * Completes an OAuth authorization for any registry provider, replacing
 * github-oauth-callback and jira-oauth-callback.
 *
 * Keeps the behaviours those two learned the hard way: state is single-use
 * and deleted on first read, it expires after ten minutes, and the browser is
 * redirected back into the app with a result in the query string rather than
 * being shown JSON.
 */

function redirect(appOrigin: string, returnTo: string, params: Record<string, string>) {
  const url = new URL(returnTo, appOrigin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders, Location: url.toString() },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const appOrigin = Deno.env.get("APP_ORIGIN") ?? "https://neo.neodevex.com";
  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const providerError = requestUrl.searchParams.get("error");

  if (providerError) {
    return redirect(appOrigin, "/environment/connections", { error: providerError });
  }
  if (!code || !state) {
    return redirect(appOrigin, "/environment/connections", { error: "missing_code" });
  }

  const admin = createAdminClient();

  // Read and delete in one step: an authorization code replayed against a
  // state that still exists is the classic way this flow gets abused.
  const { data: stateRow } = await admin
    .from("oauth_states")
    .select("*")
    .eq("state", state)
    .maybeSingle();
  await admin.from("oauth_states").delete().eq("state", state);

  if (!stateRow) {
    return redirect(appOrigin, "/environment/connections", { error: "invalid_state" });
  }

  const returnTo = (stateRow.return_to as string) ?? "/environment/connections";

  if (Date.now() - new Date(stateRow.created_at as string).getTime() > OAUTH_STATE_TTL_MS) {
    return redirect(appOrigin, returnTo, { error: "state_expired" });
  }

  const manifest = getConnectorManifest(stateRow.provider_id as string);
  if (!manifest?.oauth) {
    return redirect(appOrigin, returnTo, { error: "unknown_provider" });
  }

  const oauth = manifest.oauth as {
    tokenUrlTemplate: string;
    scopes: string[];
    clientIdEnv: string;
    clientSecretEnv: string;
    refreshable: boolean;
    identity?: { pathTemplate: string; idPointer: string; namePointer: string };
  };

  const clientId = Deno.env.get(oauth.clientIdEnv);
  const clientSecret = Deno.env.get(oauth.clientSecretEnv);
  if (!clientId || !clientSecret) {
    return redirect(appOrigin, returnTo, { error: "oauth_not_configured" });
  }

  const config = (stateRow.config as Record<string, string>) ?? {};
  const templateContext = { config, credentials: {}, params: {} };
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  let tokenUrl: string;
  try {
    tokenUrl = interpolatePath(oauth.tokenUrlTemplate, templateContext);
  } catch {
    return redirect(appOrigin, returnTo, { error: "missing_host_config" });
  }

  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: stateRow.code_verifier,
      redirect_uri: `${supabaseUrl}/functions/v1/connections-oauth-callback`,
    }),
  });

  if (!tokenResponse.ok) {
    return redirect(appOrigin, returnTo, { error: "token_exchange_failed" });
  }

  const token = (await tokenResponse.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!token.access_token) {
    return redirect(appOrigin, returnTo, { error: "no_access_token" });
  }

  const credentials: Record<string, string> = { accessToken: token.access_token };
  if (token.refresh_token) credentials.refreshToken = token.refresh_token;

  // Providers report what they actually granted, which is not always what was
  // asked for. Recording both is what lets the UI say "connected, but pull
  // requests will fail" instead of a bare green tick.
  const grantedScopes = token.scope
    ? token.scope.split(/[\s,]+/).filter(Boolean)
    : oauth.scopes;

  let displayName: string | null = null;
  const identityConfig: Record<string, string> = { ...config };
  if (oauth.identity) {
    try {
      const base = resolveBaseUrl(manifest, templateContext);
      const identityResponse = await fetch(
        `${base}${interpolatePath(oauth.identity.pathTemplate, templateContext)}`,
        {
          headers: {
            Authorization: `Bearer ${token.access_token}`,
            Accept: "application/json",
          },
        },
      );
      if (identityResponse.ok) {
        const body = await identityResponse.json();
        const read = (pointer: string): unknown =>
          pointer
            .split("/")
            .filter(Boolean)
            .reduce<unknown>((current, part) => {
              if (current === null || current === undefined) return undefined;
              if (Array.isArray(current)) return current[Number.parseInt(part, 10)];
              if (typeof current === "object") {
                return (current as Record<string, unknown>)[part];
              }
              return undefined;
            }, body);
        const name = read(oauth.identity.namePointer);
        const id = read(oauth.identity.idPointer);
        if (typeof name === "string") displayName = name;
        // Atlassian's accessible-resources call is where the cloudId comes
        // from, and every later Jira call is addressed by it.
        if (manifest.id === "jira-cloud" && typeof id === "string") {
          identityConfig.cloudId = id;
          if (typeof name === "string") identityConfig.siteUrl = name;
        }
      }
    } catch {
      // Identity is a nicety; a connection with no display name still works.
    }
  }

  let encrypted: string;
  try {
    encrypted = await encryptJson(admin, credentials);
  } catch {
    return redirect(appOrigin, returnTo, { error: "encryption_not_configured" });
  }

  const probe = await runConnectorProbe(manifest, identityConfig, credentials);
  const missingScopes = oauth.scopes.filter((scope) => !grantedScopes.includes(scope));
  const status = !probe.ok ? "error" : missingScopes.length > 0 ? "degraded" : "ok";

  const { error: upsertError } = await admin.from("connections").upsert(
    {
      org_id: stateRow.org_id,
      capability: manifest.capability,
      provider_id: manifest.id,
      instance_key: stateRow.instance_key,
      display_name: displayName,
      config: identityConfig,
      encrypted_credentials: encrypted,
      credential_fingerprint: await fingerprint(token.access_token),
      redacted_summary: displayName ? { account: displayName } : {},
      requested_scopes: oauth.scopes,
      granted_scopes: grantedScopes,
      status,
      last_probe: probe,
      last_probe_at: probe.probedAt,
      expires_at: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : null,
      created_by: stateRow.user_id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id,capability,provider_id,instance_key" },
  );

  if (upsertError) {
    return redirect(appOrigin, returnTo, { error: "upsert_failed" });
  }

  await admin.from("environment_checks").insert({
    org_id: stateRow.org_id,
    kind: "connection",
    target: `${manifest.id}:${stateRow.instance_key}`,
    vantage: probe.vantage,
    ok: probe.ok,
    latency_ms: probe.latencyMs,
    checks: probe.checks,
    remediation: probe.remediation ?? null,
    actor: stateRow.user_id,
  });

  return redirect(appOrigin, returnTo, { connected: manifest.id });
});
