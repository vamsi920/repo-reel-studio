import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, getCallerUserId } from "../_shared/supabase-admin.ts";
import { JIRA_TOKEN_URL, jiraApiBaseUrl, jiraOAuthCredentials } from "../_shared/jira.ts";

const DEFAULT_JQL = "assignee = currentUser() ORDER BY updated DESC";

interface JiraConnectionRow {
  cloud_id: string;
  encrypted_access_token: string;
  encrypted_refresh_token: string | null;
}

async function decryptToken(
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

/**
 * Atlassian access tokens are short-lived (~1hr), unlike GitHub's -- rather
 * than tracking an expiry timestamp, just try the request and refresh once
 * on a 401. Keeps the proxy stateless about token lifetime.
 */
async function refreshAccessToken(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  refreshToken: string,
  encryptionKey: string,
): Promise<string | null> {
  let clientId: string;
  let clientSecret: string;
  try {
    ({ clientId, clientSecret } = jiraOAuthCredentials());
  } catch {
    return null;
  }

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
  if (!response.ok) return null;
  const json = await response.json();
  const accessToken: string | undefined = json.access_token;
  const newRefreshToken: string | undefined = json.refresh_token;
  if (!accessToken) return null;

  const { data: encryptedAccessToken } = await admin.rpc(
    "encrypt_github_token",
    { token: accessToken, encryption_key: encryptionKey },
  );
  if (!encryptedAccessToken) return null;

  let encryptedRefreshToken: string | null = null;
  if (newRefreshToken) {
    const { data } = await admin.rpc("encrypt_github_token", {
      token: newRefreshToken,
      encryption_key: encryptionKey,
    });
    encryptedRefreshToken = data ?? null;
  }

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

  return accessToken;
}

function jiraHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, Accept: "application/json" };
}

async function searchIssues(cloudId: string, token: string, jql: string) {
  const params = new URLSearchParams({
    jql,
    maxResults: "25",
    fields: "summary,status,issuetype,priority,updated",
  });
  const response = await fetch(
    `${jiraApiBaseUrl(cloudId)}/rest/api/3/search?${params}`,
    { headers: jiraHeaders(token) },
  );
  return response;
}

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

  const admin = createAdminClient();
  const { data: connection } = await admin
    .from("jira_connections")
    .select("cloud_id, encrypted_access_token, encrypted_refresh_token")
    .eq("user_id", userId)
    .maybeSingle<JiraConnectionRow>();
  if (!connection) {
    return jsonResponse({ error: "not_connected" }, { status: 404 });
  }

  const encryptionKey = Deno.env.get("GITHUB_TOKEN_ENCRYPTION_KEY");
  if (!encryptionKey) {
    return jsonResponse({ error: "encryption_not_configured" }, { status: 500 });
  }

  let accessToken = await decryptToken(
    admin,
    connection.encrypted_access_token,
    encryptionKey,
  );
  if (!accessToken) {
    return jsonResponse({ error: "decryption_failed" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action as string | undefined;
  if (action !== "issues" && action !== "search") {
    return jsonResponse({ error: "unknown_action" }, { status: 400 });
  }
  const jql = typeof body.jql === "string" && body.jql.trim() ? body.jql : DEFAULT_JQL;

  try {
    let response = await searchIssues(connection.cloud_id, accessToken, jql);
    if (response.status === 401 && connection.encrypted_refresh_token) {
      const refreshToken = await decryptToken(
        admin,
        connection.encrypted_refresh_token,
        encryptionKey,
      );
      if (refreshToken) {
        const refreshed = await refreshAccessToken(
          admin,
          userId,
          refreshToken,
          encryptionKey,
        );
        if (refreshed) {
          accessToken = refreshed;
          response = await searchIssues(connection.cloud_id, accessToken, jql);
        }
      }
    }
    if (!response.ok) {
      return jsonResponse(
        { error: `jira_api_error_${response.status}` },
        { status: 502 },
      );
    }
    const json = await response.json();
    const issues = (json.issues ?? []) as Record<string, unknown>[];
    return jsonResponse({
      issues: issues.map((issue) => {
        const fields = issue.fields as Record<string, unknown>;
        return {
          key: issue.key,
          summary: fields.summary,
          status: (fields.status as Record<string, unknown> | undefined)?.name,
          type: (fields.issuetype as Record<string, unknown> | undefined)?.name,
          priority: (fields.priority as Record<string, unknown> | undefined)
            ?.name,
          updated: fields.updated,
        };
      }),
    });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "jira_api_error" },
      { status: 502 },
    );
  }
});
