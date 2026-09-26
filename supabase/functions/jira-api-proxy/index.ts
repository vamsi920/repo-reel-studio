import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, getCallerUserId } from "../_shared/supabase-admin.ts";
import {
  decryptJiraToken,
  jiraApiBaseUrl,
  refreshJiraAccessTokenLocked,
} from "../_shared/jira.ts";

const DEFAULT_JQL = "assignee = currentUser() ORDER BY updated DESC";

interface JiraConnectionRow {
  cloud_id: string;
  encrypted_access_token: string;
  encrypted_refresh_token: string | null;
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

  let accessToken = await decryptJiraToken(
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
      const refreshToken = await decryptJiraToken(
        admin,
        connection.encrypted_refresh_token,
        encryptionKey,
      );
      if (refreshToken) {
        const refreshed = await refreshJiraAccessTokenLocked(
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
