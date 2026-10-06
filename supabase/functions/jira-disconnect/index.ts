import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, getCallerUserId } from "../_shared/supabase-admin.ts";
import { cleanupJiraUserArtifacts } from "../_shared/jira-cleanup.ts";
import { deleteUserConnections, JIRA_PROVIDER_IDS } from "../_shared/connection-sync.ts";

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

  // Note: this does not delete the automation-service's custom webhook
  // (source "jira") -- that would need the deployment's real automation
  // session key, which this function doesn't hold. It stays registered but
  // inert once nothing points at it.
  await cleanupJiraUserArtifacts(admin, userId);

  const { error } = await admin
    .from("jira_connections")
    .delete()
    .eq("user_id", userId);
  if (error) {
    return jsonResponse({ error: "disconnect_failed" }, { status: 500 });
  }

  // The generic row this user authorised goes too, or the Environment page
  // and the onboarding agent keep showing (and `connections-proxy` keeps
  // using) a Jira connection the user just removed.
  await deleteUserConnections(admin, userId, JIRA_PROVIDER_IDS);

  return jsonResponse({ ok: true });
});
