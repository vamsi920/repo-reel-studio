import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, getCallerUserId } from "../_shared/supabase-admin.ts";
import { JIRA_WEBHOOK_REGISTER_URL_TEMPLATE } from "../_shared/jira.ts";

interface JiraConnectionRow {
  cloud_id: string;
  encrypted_access_token: string;
}

interface RegistrationRow {
  cloud_id: string;
  atlassian_webhook_id: string;
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

  // Best-effort Atlassian-side cleanup, done BEFORE deleting the connection
  // (that's where the access token needed to authenticate the delete call
  // lives). Not fatal if it fails -- an orphaned dynamic webhook just
  // expires naturally after 30 days with nothing to call, and by then the
  // registration row (and the receiver's lookup) is already gone.
  //
  // Note: this does not delete the automation-service's custom webhook
  // (source "jira") -- that would need the deployment's real automation
  // session key, which this function doesn't hold (only the narrower
  // agent-server bridge key used for pushing JIRA_TOKEN). It stays
  // registered but inert once nothing points at it.
  const encryptionKey = Deno.env.get("GITHUB_TOKEN_ENCRYPTION_KEY");
  const { data: registration } = await admin
    .from("jira_webhook_registrations")
    .select("cloud_id, atlassian_webhook_id")
    .eq("user_id", userId)
    .maybeSingle<RegistrationRow>();
  if (registration && encryptionKey) {
    const { data: connection } = await admin
      .from("jira_connections")
      .select("cloud_id, encrypted_access_token")
      .eq("user_id", userId)
      .maybeSingle<JiraConnectionRow>();
    if (connection) {
      const { data: accessToken } = await admin.rpc("decrypt_github_token", {
        ciphertext: connection.encrypted_access_token,
        encryption_key: encryptionKey,
      });
      if (accessToken) {
        try {
          await fetch(
            JIRA_WEBHOOK_REGISTER_URL_TEMPLATE.replace("{cloudId}", connection.cloud_id),
            {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                webhookIds: [Number(registration.atlassian_webhook_id)],
              }),
            },
          );
        } catch {
          // Best-effort -- see comment above.
        }
      }
    }
  }

  await admin.from("jira_automation_triggers").delete().eq("user_id", userId);
  await admin.from("jira_webhook_registrations").delete().eq("user_id", userId);

  const { error } = await admin
    .from("jira_connections")
    .delete()
    .eq("user_id", userId);
  if (error) {
    return jsonResponse({ error: "disconnect_failed" }, { status: 500 });
  }

  return jsonResponse({ ok: true });
});
