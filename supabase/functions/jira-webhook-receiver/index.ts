import { createAdminClient } from "../_shared/supabase-admin.ts";
import {
  JIRA_TOKEN_URL,
  hmacSha256Hex,
  jiraOAuthCredentials,
  verifyAtlassianWebhookJwt,
} from "../_shared/jira.ts";

interface RegistrationRow {
  automation_org_id: string;
  encrypted_webhook_secret: string;
  signature_header: string;
}

interface JiraConnectionRow {
  encrypted_access_token: string;
  encrypted_refresh_token: string | null;
}

async function decrypt(
  admin: ReturnType<typeof createAdminClient>,
  ciphertext: string,
  encryptionKey: string,
): Promise<string | null> {
  const { data } = await admin.rpc("decrypt_github_token", {
    ciphertext,
    encryption_key: encryptionKey,
  });
  return data ?? null;
}

async function encrypt(
  admin: ReturnType<typeof createAdminClient>,
  token: string,
  encryptionKey: string,
): Promise<string | null> {
  const { data } = await admin.rpc("encrypt_github_token", {
    token,
    encryption_key: encryptionKey,
  });
  return data ?? null;
}

/** Always refreshes -- a webhook can fire at any point in the ~1hr access
 * token lifetime, so there's no cheaper correct check than just refreshing.
 * Falls back to the existing (possibly stale) access token if the refresh
 * itself fails, so a transient Atlassian hiccup doesn't drop the run. */
async function refreshAccessToken(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  refreshToken: string,
  fallbackAccessToken: string,
  encryptionKey: string,
): Promise<string> {
  try {
    const { clientId, clientSecret } = jiraOAuthCredentials();
    const response = await fetch(JIRA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
    });
    if (!response.ok) return fallbackAccessToken;
    const json = await response.json();
    const accessToken: string | undefined = json.access_token;
    const newRefreshToken: string | undefined = json.refresh_token;
    if (!accessToken) return fallbackAccessToken;

    const encryptedAccessToken = await encrypt(admin, accessToken, encryptionKey);
    const encryptedRefreshToken = newRefreshToken
      ? await encrypt(admin, newRefreshToken, encryptionKey)
      : null;
    if (encryptedAccessToken) {
      await admin
        .from("jira_connections")
        .update({
          encrypted_access_token: encryptedAccessToken,
          ...(encryptedRefreshToken
            ? { encrypted_refresh_token: encryptedRefreshToken }
            : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
    }
    return accessToken;
  } catch {
    return fallbackAccessToken;
  }
}

/** Pushes the fresh access token into the agent-server's own secret store
 * (`PUT /api/settings/secrets`, same endpoint `SecretsService.createSecret`
 * uses from the browser) so the triggered run's `curl` calls against Jira
 * have a live `$JIRA_TOKEN` -- this fires server-side with no browser tab
 * involved, which is exactly the gap a standing secret can't fill on its
 * own for a token this short-lived. */
async function pushTokenToAgentServer(accessToken: string): Promise<boolean> {
  const agentServerUrl = Deno.env.get("AGENT_SERVER_URL");
  const bridgeKey = Deno.env.get("AGENT_BRIDGE_API_KEY");
  if (!agentServerUrl || !bridgeKey) return false;
  try {
    const response = await fetch(`${agentServerUrl}/api/settings/secrets`, {
      method: "PUT",
      headers: {
        "X-Session-API-Key": bridgeKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "JIRA_TOKEN",
        value: accessToken,
        description: "Jira access token (auto-managed by jira-webhook-receiver)",
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const registrationId = new URL(req.url).pathname.split("/").filter(Boolean).pop();
  if (!registrationId) {
    return new Response("missing registration id", { status: 400 });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!bearerToken) {
    return new Response("missing bearer token", { status: 401 });
  }

  const { clientSecret } = (() => {
    try {
      return jiraOAuthCredentials();
    } catch {
      return { clientSecret: "" };
    }
  })();
  if (!clientSecret || !(await verifyAtlassianWebhookJwt(bearerToken, clientSecret))) {
    return new Response("invalid signature", { status: 401 });
  }

  const rawBody = await req.text();

  const admin = createAdminClient();
  const { data: registration } = await admin
    .from("jira_webhook_registrations")
    .select("automation_org_id, encrypted_webhook_secret, signature_header")
    .eq("user_id", registrationId)
    .maybeSingle<RegistrationRow>();
  if (!registration) {
    return new Response("unknown registration", { status: 404 });
  }

  const encryptionKey = Deno.env.get("GITHUB_TOKEN_ENCRYPTION_KEY");
  if (!encryptionKey) {
    return new Response("encryption not configured", { status: 500 });
  }

  const { data: connection } = await admin
    .from("jira_connections")
    .select("encrypted_access_token, encrypted_refresh_token")
    .eq("user_id", registrationId)
    .maybeSingle<JiraConnectionRow>();
  if (connection) {
    const accessToken = await decrypt(
      admin,
      connection.encrypted_access_token,
      encryptionKey,
    );
    const refreshToken = connection.encrypted_refresh_token
      ? await decrypt(admin, connection.encrypted_refresh_token, encryptionKey)
      : null;
    if (accessToken) {
      const freshToken = refreshToken
        ? await refreshAccessToken(
            admin,
            registrationId,
            refreshToken,
            accessToken,
            encryptionKey,
          )
        : accessToken;
      await pushTokenToAgentServer(freshToken);
    }
  }

  const webhookSecret = await decrypt(
    admin,
    registration.encrypted_webhook_secret,
    encryptionKey,
  );
  const automationBaseUrl = Deno.env.get("AUTOMATION_SERVICE_BASE_URL");
  if (!webhookSecret || !automationBaseUrl) {
    return new Response(JSON.stringify({ received: true, forwarded: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const signature = await hmacSha256Hex(webhookSecret, rawBody);
  try {
    const forwardResponse = await fetch(
      `${automationBaseUrl}/v1/events/${registration.automation_org_id}/jira`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [registration.signature_header]: signature,
        },
        body: rawBody,
      },
    );
    return new Response(
      JSON.stringify({ received: true, forwarded: forwardResponse.ok }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch {
    return new Response(JSON.stringify({ received: true, forwarded: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});
