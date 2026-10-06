import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { JIRA_WEBHOOK_REGISTER_URL_TEMPLATE } from "./jira.ts";
import { legacyEncryptionKey } from "./secrets.ts";

interface JiraConnectionRow {
  cloud_id: string;
  encrypted_access_token: string;
}

interface RegistrationRow {
  cloud_id: string;
  atlassian_webhook_id: string;
}

/**
 * Removes everything a Jira connection set up on the user's behalf: the
 * Atlassian dynamic webhook, the registration row and the automation
 * triggers. Shared by `jira-disconnect` (Settings page) and
 * `connections-disconnect` (Environment page / onboarding), which used to
 * differ -- disconnecting from the Environment page left the webhook and its
 * triggers firing against a connection that no longer existed.
 *
 * Must run BEFORE `jira_connections` is deleted: that row holds the access
 * token needed to authenticate the Atlassian-side delete. Best-effort on the
 * Atlassian side -- an orphaned dynamic webhook expires on its own after 30
 * days with nothing to call.
 */
export async function cleanupJiraUserArtifacts(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  let encryptionKey: string | null = null;
  try {
    encryptionKey = legacyEncryptionKey();
  } catch {
    encryptionKey = null;
  }
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
          // Best-effort -- see above.
        }
      }
    }
  }

  await admin.from("jira_automation_triggers").delete().eq("user_id", userId);
  await admin.from("jira_webhook_registrations").delete().eq("user_id", userId);
}
