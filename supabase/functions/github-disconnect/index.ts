import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, getCallerUserId } from "../_shared/supabase-admin.ts";
import { deleteUserConnections } from "../_shared/connection-sync.ts";

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

  // `github_connections` holds one row per user, for either github.com or an
  // Enterprise host. Only the generic row of that same variant is removed
  // below, so disconnecting github.com never takes a still-wanted Enterprise
  // connection with it.
  const { data: existing } = await admin
    .from("github_connections")
    .select("enterprise_host")
    .eq("user_id", userId)
    .maybeSingle();

  const { error } = await admin
    .from("github_connections")
    .delete()
    .eq("user_id", userId);
  if (error) {
    return jsonResponse({ error: "disconnect_failed" }, { status: 500 });
  }

  if (existing) {
    await deleteUserConnections(admin, userId, [
      existing.enterprise_host ? "github-enterprise" : "github",
    ]);
  }

  return jsonResponse({ ok: true });
});
