import { jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { JIRA_WEBHOOK_REFRESH_URL_TEMPLATE } from "../_shared/jira.ts";

interface RegistrationRow {
  user_id: string;
  cloud_id: string;
  atlassian_webhook_id: string;
}

interface JiraConnectionRow {
  encrypted_access_token: string;
}

/**
 * Scheduled daily (Supabase cron -> this function). Atlassian dynamic
 * webhooks expire after 30 days with no renewal API-side heads-up, so this
 * is the only recurring job the Jira trigger feature needs -- everything
 * else (token freshness) is handled per-event by `jira-webhook-receiver`.
 * Best-effort per registration: one failing site shouldn't block the rest.
 */
Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  // Deployed with --no-verify-jwt (the pg_cron caller carries no Supabase
  // session) -- gated by a shared secret instead, checked directly here.
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("X-Cron-Secret") !== cronSecret) {
    return jsonResponse({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const encryptionKey = Deno.env.get("GITHUB_TOKEN_ENCRYPTION_KEY");
  if (!encryptionKey) {
    return jsonResponse({ error: "encryption_not_configured" }, { status: 500 });
  }

  const { data: registrations } = await admin
    .from("jira_webhook_registrations")
    .select("user_id, cloud_id, atlassian_webhook_id");

  const results: { userId: string; ok: boolean }[] = [];
  for (const registration of (registrations ?? []) as RegistrationRow[]) {
    try {
      const { data: connection } = await admin
        .from("jira_connections")
        .select("encrypted_access_token")
        .eq("user_id", registration.user_id)
        .maybeSingle<JiraConnectionRow>();
      if (!connection) {
        results.push({ userId: registration.user_id, ok: false });
        continue;
      }
      const { data: accessToken } = await admin.rpc("decrypt_github_token", {
        ciphertext: connection.encrypted_access_token,
        encryption_key: encryptionKey,
      });
      if (!accessToken) {
        results.push({ userId: registration.user_id, ok: false });
        continue;
      }

      const url = JIRA_WEBHOOK_REFRESH_URL_TEMPLATE.replace(
        "{cloudId}",
        registration.cloud_id,
      );
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          webhookIds: [Number(registration.atlassian_webhook_id)],
        }),
      });
      results.push({ userId: registration.user_id, ok: response.ok });
    } catch {
      results.push({ userId: registration.user_id, ok: false });
    }
  }

  return jsonResponse({ renewed: results });
});
