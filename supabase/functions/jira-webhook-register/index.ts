import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, getCallerUserId } from "../_shared/supabase-admin.ts";
import { JIRA_WEBHOOK_REGISTER_URL_TEMPLATE } from "../_shared/jira.ts";

interface RegisterBody {
  orgId: string;
  webhookId: string;
  webhookSecret: string;
  signatureHeader: string;
}

interface JiraConnectionRow {
  cloud_id: string;
  encrypted_access_token: string;
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

  // Idempotent: a second call (e.g. a retried request) reuses the existing
  // registration instead of leaving an orphaned Atlassian-side webhook.
  const { data: existing } = await admin
    .from("jira_webhook_registrations")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) {
    return jsonResponse({ ok: true, alreadyRegistered: true });
  }

  const body = (await req.json().catch(() => null)) as RegisterBody | null;
  if (!body?.orgId || !body.webhookId || !body.webhookSecret || !body.signatureHeader) {
    return jsonResponse({ error: "missing_fields" }, { status: 400 });
  }

  const { data: connection } = await admin
    .from("jira_connections")
    .select("cloud_id, encrypted_access_token")
    .eq("user_id", userId)
    .maybeSingle<JiraConnectionRow>();
  if (!connection) {
    return jsonResponse({ error: "jira_not_connected" }, { status: 404 });
  }

  const encryptionKey = Deno.env.get("GITHUB_TOKEN_ENCRYPTION_KEY");
  if (!encryptionKey) {
    return jsonResponse({ error: "encryption_not_configured" }, { status: 500 });
  }

  const { data: accessToken } = await admin.rpc("decrypt_github_token", {
    ciphertext: connection.encrypted_access_token,
    encryption_key: encryptionKey,
  });
  if (!accessToken) {
    return jsonResponse({ error: "decryption_failed" }, { status: 500 });
  }

  const callbackUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/jira-webhook-receiver/${userId}`;
  const atlassianUrl = JIRA_WEBHOOK_REGISTER_URL_TEMPLATE.replace(
    "{cloudId}",
    connection.cloud_id,
  );

  const registerResponse = await fetch(atlassianUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      url: callbackUrl,
      webhooks: [
        { events: ["jira:issue_created", "jira:issue_updated"] },
      ],
    }),
  });
  if (!registerResponse.ok) {
    return jsonResponse(
      { error: "atlassian_registration_failed", status: registerResponse.status },
      { status: 502 },
    );
  }
  const registerJson = await registerResponse.json();
  const result = registerJson.webhookRegistrationResult?.[0];
  const atlassianWebhookId = result?.createdWebhookId;
  if (atlassianWebhookId === undefined || atlassianWebhookId === null) {
    return jsonResponse(
      { error: "atlassian_registration_missing_id", detail: result?.errors },
      { status: 502 },
    );
  }

  const { data: encryptedSecret, error: encryptError } = await admin.rpc(
    "encrypt_github_token",
    { token: body.webhookSecret, encryption_key: encryptionKey },
  );
  if (encryptError || !encryptedSecret) {
    return jsonResponse({ error: "secret_encryption_failed" }, { status: 500 });
  }

  const { error: upsertError } = await admin
    .from("jira_webhook_registrations")
    .upsert({
      user_id: userId,
      automation_org_id: body.orgId,
      automation_webhook_id: body.webhookId,
      encrypted_webhook_secret: encryptedSecret,
      signature_header: body.signatureHeader,
      atlassian_webhook_id: String(atlassianWebhookId),
      cloud_id: connection.cloud_id,
      updated_at: new Date().toISOString(),
    });
  if (upsertError) {
    return jsonResponse({ error: "save_failed" }, { status: 500 });
  }

  return jsonResponse({ ok: true });
});
