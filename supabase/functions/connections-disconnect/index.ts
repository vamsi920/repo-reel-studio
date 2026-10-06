import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, getCallerUserId } from "../_shared/supabase-admin.ts";
import { getCallerOrgId, requireOrgRole } from "../_shared/org.ts";
import { unmirrorFromLegacy } from "../_shared/legacy-mirror.ts";
import { cleanupJiraUserArtifacts } from "../_shared/jira-cleanup.ts";

/**
 * Removes a connection.
 *
 * Deliberately does NOT attempt to clean up whatever the provider is holding
 * on our behalf -- registered webhooks, written vectors, minted deploy keys.
 * Each of those needs the adapter that created it, and a half-finished
 * cleanup here would leave the customer worse off than a clean deletion plus
 * an explicit note. What this does guarantee is that the credential stops
 * being usable from this deployment immediately.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const userId = await getCallerUserId(req);
  if (!userId) return jsonResponse({ error: "unauthorized" }, { status: 401 });

  let payload: { action?: string; connectionId?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_body" }, { status: 400 });
  }

  if (payload.action !== "disconnect" || !payload.connectionId) {
    return jsonResponse({ error: "unknown_action" }, { status: 400 });
  }

  const admin = createAdminClient();
  const orgId = await getCallerOrgId(admin, userId);
  if (!orgId) return jsonResponse({ error: "no_org" }, { status: 403 });
  if (!(await requireOrgRole(admin, userId, orgId, "admin"))) {
    return jsonResponse({ error: "forbidden" }, { status: 403 });
  }

  const { data: connection } = await admin
    .from("connections")
    .select("id, org_id, provider_id, instance_key, created_by")
    .eq("id", payload.connectionId)
    .maybeSingle();

  if (!connection) return jsonResponse({ error: "not_connected" }, { status: 404 });
  // Scoped by org as well as id, so a valid connection id from another
  // tenant cannot be deleted by guessing it.
  if (connection.org_id !== orgId) {
    return jsonResponse({ error: "forbidden" }, { status: 403 });
  }

  const { error } = await admin
    .from("connections")
    .delete()
    .eq("id", payload.connectionId)
    .eq("org_id", orgId);

  if (error) return jsonResponse({ error: "delete_failed" }, { status: 500 });

  // Remove the mirrored legacy row too, or the two stores diverge: the
  // Environment screen would show the provider as gone while the repo picker
  // kept working off a connection nobody can see or revoke. The legacy
  // tables are keyed by whoever originally authorised the connection
  // (`created_by`, set by `mirrorToLegacy`/`connections-oauth-complete`),
  // which is not necessarily the caller disconnecting it here -- any org
  // admin can disconnect a connection a teammate created. Passing the
  // caller's own id instead used to unmirror nothing when the disconnecting
  // admin differed from the original connector (no row keyed by the admin's
  // id existed), leaving the original connector's legacy-mirrored credential
  // fully usable via github-api-proxy/github-mint-clone-credential even
  // though the UI reported the provider as disconnected. `created_by` can be
  // null if that user's account was since deleted, in which case the legacy
  // row was already removed by the same cascade and there's nothing to do.
  if (connection.created_by) {
    // Jira also left a webhook and automation triggers behind; tear those
    // down the way the Settings page's disconnect does. Runs while the
    // legacy row (and its access token) still exists.
    if (connection.provider_id === "jira-cloud") {
      await cleanupJiraUserArtifacts(admin, connection.created_by as string).catch(
        () => undefined,
      );
    }
    await unmirrorFromLegacy(
      admin,
      connection.provider_id as string,
      connection.created_by as string,
    ).catch(() => undefined);
  }

  await admin.from("environment_checks").insert({
    org_id: orgId,
    kind: "disconnect",
    target: `${connection.provider_id}:${connection.instance_key}`,
    vantage: "edge",
    ok: true,
    checks: [],
    actor: userId,
  });

  return jsonResponse({ ok: true });
});
