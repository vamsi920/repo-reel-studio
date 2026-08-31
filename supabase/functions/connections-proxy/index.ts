import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, getCallerUserId } from "../_shared/supabase-admin.ts";
import { getCallerOrgId } from "../_shared/org.ts";
import { decryptJson, encryptJson } from "../_shared/secrets.ts";
import { getConnectorManifest } from "../_shared/connector-registry/index.ts";
import {
  interpolateHeaders,
  interpolatePath,
  interpolateValue,
  resolveBaseUrl,
  TemplateError,
} from "../_shared/template.ts";

/**
 * The one server-side path through which the app talks to a customer's
 * providers.
 *
 * Callers name an operation the manifest declares; they never supply a URL.
 * That is the whole SSRF story: a self-hosted connector's `hostOverride` lets
 * a customer point us at an internal address on purpose, so a proxy that
 * accepted arbitrary paths would let anyone with an account read the
 * deployment's own metadata service. Named operations plus the host deny-list
 * in `template.ts` close that off by construction rather than by validation
 * of an untrusted string.
 */

const REQUEST_TIMEOUT_MS = 15_000;

function authHeaders(
  manifest: { id: string; authKind: string },
  credentials: Record<string, string>,
): Record<string, string> {
  switch (manifest.authKind) {
    case "oauth2-pkce":
    case "oauth2-client-credentials":
    case "bearer-token":
      return {
        Authorization: `Bearer ${credentials.accessToken ?? credentials.token ?? credentials.botToken ?? ""}`,
      };
    case "api-key": {
      if (manifest.id === "pinecone") return { "Api-Key": credentials.apiKey ?? "" };
      if (manifest.id === "anthropic") return { "x-api-key": credentials.apiKey ?? "" };
      if (manifest.id === "google-gemini")
        return { "x-goog-api-key": credentials.apiKey ?? "" };
      if (manifest.id === "azure-openai") return { "api-key": credentials.apiKey ?? "" };
      if (manifest.id === "qdrant") return { "api-key": credentials.apiKey ?? "" };
      if (manifest.id === "elasticsearch")
        return { Authorization: `ApiKey ${credentials.apiKey ?? ""}` };
      if (manifest.id === "linear") return { Authorization: credentials.apiKey ?? "" };
      if (manifest.id === "okta")
        return { Authorization: `SSWS ${credentials.apiToken ?? ""}` };
      return { Authorization: `Bearer ${credentials.apiKey ?? ""}` };
    }
    case "basic": {
      const user = credentials.username ?? "";
      const pass = credentials.password ?? credentials.apiToken ?? "";
      return { Authorization: `Basic ${btoa(`${user}:${pass}`)}` };
    }
    default:
      return {};
  }
}

/**
 * Refreshes an expiring OAuth token.
 *
 * Serialised through a Postgres advisory lock keyed on the connection id.
 * Atlassian rotates the refresh token on every use, so two concurrent
 * refreshes race and the loser writes back a token the provider has already
 * invalidated -- which presents later as a connection that mysteriously
 * stopped working under load.
 */
async function refreshIfNeeded(
  admin: ReturnType<typeof createAdminClient>,
  connection: Record<string, unknown>,
  manifest: { id: string; oauth?: Record<string, unknown> },
  credentials: Record<string, string>,
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

  const expiresAt = connection.expires_at as string | null;
  const soon = Date.now() + 60_000;
  if (expiresAt && new Date(expiresAt).getTime() > soon) return credentials;

  const lockKey = connection.id as string;
  const { data: gotLock } = await admin.rpc("environment_try_advisory_lock", {
    lock_key: lockKey,
  });
  if (gotLock === false) {
    // Another request is refreshing right now. Using the current token is
    // correct: it is still valid for at least the next minute.
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

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: credentials.refreshToken,
      }),
    });

    if (!response.ok) {
      // invalid_grant means the refresh token is dead. Marking the connection
      // expired surfaces a re-consent prompt instead of failing every call
      // from now on with an opaque 401.
      await admin
        .from("connections")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", lockKey);
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
      .eq("id", lockKey);

    return next;
  } finally {
    await admin.rpc("environment_advisory_unlock", { lock_key: lockKey });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const userId = await getCallerUserId(req);
  if (!userId) return jsonResponse({ error: "unauthorized" }, { status: 401 });

  let payload: {
    action?: string;
    connectionId?: string;
    operation?: string;
    params?: Record<string, string>;
    body?: unknown;
  };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_body" }, { status: 400 });
  }

  if (payload.action !== "call" || !payload.connectionId || !payload.operation) {
    return jsonResponse({ error: "unknown_action" }, { status: 400 });
  }

  const admin = createAdminClient();
  const orgId = await getCallerOrgId(admin, userId);
  if (!orgId) return jsonResponse({ error: "no_org" }, { status: 403 });

  const { data: connection } = await admin
    .from("connections")
    .select("*")
    .eq("id", payload.connectionId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!connection) return jsonResponse({ error: "not_connected" }, { status: 404 });

  const manifest = getConnectorManifest(connection.provider_id as string);
  if (!manifest) return jsonResponse({ error: "unknown_provider" }, { status: 400 });

  const operation = (manifest.operations ?? []).find(
    (candidate) => candidate.id === payload.operation,
  );
  if (!operation) {
    return jsonResponse({ error: "unknown_operation" }, { status: 400 });
  }

  const allowedParams = new Set(operation.params ?? []);
  const params: Record<string, string> = {};
  for (const [name, value] of Object.entries(payload.params ?? {})) {
    if (!allowedParams.has(name)) {
      return jsonResponse({ error: "unknown_param", param: name }, { status: 400 });
    }
    params[name] = String(value);
  }

  let credentials: Record<string, string>;
  try {
    credentials = connection.encrypted_credentials
      ? await decryptJson(admin, connection.encrypted_credentials as string)
      : {};
  } catch (error) {
    return jsonResponse(
      { error: (error as Error).message ?? "decryption_failed" },
      { status: 500 },
    );
  }

  credentials = await refreshIfNeeded(admin, connection, manifest, credentials);

  const config = (connection.config as Record<string, string>) ?? {};
  const context = { config, credentials, params };

  let url: string;
  try {
    url = `${resolveBaseUrl(manifest, context)}${interpolatePath(operation.pathTemplate, context)}`;
  } catch (error) {
    const code = error instanceof TemplateError ? error.code : "bad_request";
    return jsonResponse({ error: code }, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const upstream = await fetch(url, {
      method: operation.method,
      headers: {
        Accept: "application/json",
        ...(operation.method === "GET" ? {} : { "Content-Type": "application/json" }),
        ...authHeaders(manifest, credentials),
        ...interpolateHeaders(operation.headers, context),
      },
      body:
        operation.method === "GET"
          ? undefined
          : operation.bodyTemplate
            ? interpolateValue(operation.bodyTemplate, context)
            : payload.body !== undefined
              ? JSON.stringify(payload.body)
              : undefined,
      signal: controller.signal,
    });

    const text = await upstream.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }

    // Quota headroom is passed through rather than dropped, so a caller that
    // is about to exhaust the customer's API budget can back off.
    const rateLimit = {
      remaining: upstream.headers.get("x-ratelimit-remaining"),
      reset: upstream.headers.get("x-ratelimit-reset"),
      retryAfter: upstream.headers.get("retry-after"),
    };

    return jsonResponse(
      { status: upstream.status, ok: upstream.ok, data: parsed, rateLimit },
      { status: upstream.ok ? 200 : 502 },
    );
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    return jsonResponse(
      { error: aborted ? "upstream_timeout" : "upstream_unreachable" },
      { status: 504 },
    );
  } finally {
    clearTimeout(timer);
  }
});
