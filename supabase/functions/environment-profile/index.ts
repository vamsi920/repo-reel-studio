import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, getCallerUserId } from "../_shared/supabase-admin.ts";
import { getCallerOrgId, requireOrgRole } from "../_shared/org.ts";
import { mergeEgressHosts, renderPacket, resolveEgressPurpose } from "../_shared/environment-packet.ts";

/**
 * Environment profile operations that need the server: reading the connection
 * set, and rendering the admin handoff packet.
 *
 * Plain profile reads and writes go directly through RLS from the browser --
 * the document holds no credentials. This function exists for the two things
 * the browser genuinely cannot do: enumerate which OAuth applications the
 * deployment has configured, and turn all of that into the document an
 * onboarding engineer hands to the customer's own administrators.
 */

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const userId = await getCallerUserId(req);
  if (!userId) return jsonResponse({ error: "unauthorized" }, { status: 401 });

  let payload: {
    action?: string;
    doc?: Record<string, unknown>;
    requirementId?: string;
    assigneeEmail?: string;
    note?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const orgId = await getCallerOrgId(admin, userId);
  if (!orgId) return jsonResponse({ error: "no_org" }, { status: 403 });

  if (payload.action === "get") {
    const { data } = await admin
      .from("environment_profiles")
      .select("doc, revision, updated_at")
      .eq("org_id", orgId)
      .maybeSingle();
    return jsonResponse(data ?? { doc: null });
  }

  if (payload.action === "assign-task") {
    if (!payload.requirementId) {
      return jsonResponse({ error: "missing_requirement" }, { status: 400 });
    }
    // Members, not admins: the whole point is that the person who cannot do
    // the work is the one recording who can.
    if (!(await requireOrgRole(admin, userId, orgId, "member"))) {
      return jsonResponse({ error: "forbidden" }, { status: 403 });
    }
    const { error } = await admin.from("environment_onboarding_tasks").upsert(
      {
        org_id: orgId,
        requirement_id: payload.requirementId,
        assignee_email: payload.assigneeEmail ?? null,
        note: payload.note ?? null,
        status: "open",
        created_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,requirement_id" },
    );
    if (error) {
      return jsonResponse({ error: "assign_failed", detail: error.message }, { status: 500 });
    }
    return jsonResponse({ ok: true });
  }

  if (payload.action === "handoff-packet") {
    if (!(await requireOrgRole(admin, userId, orgId, "member"))) {
      return jsonResponse({ error: "forbidden" }, { status: 403 });
    }

    const { data: connections } = await admin
      .from("connections")
      .select("provider_id, capability")
      .eq("org_id", orgId);

    const providers = (connections ?? []).map((row) => ({
      id: row.provider_id as string,
      capability: row.capability as string,
    }));

    const hostList = mergeEgressHosts(providers);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const appOrigin = Deno.env.get("APP_ORIGIN") ?? "https://neo.neodevex.com";

    const allowlistCsv = [
      "host,port,purpose,mirrorable",
      ...hostList.map((host) =>
        [
          host.host,
          String(host.port),
          resolveEgressPurpose(host.purposeKey).replace(/,/g, " "),
          host.mirrorable ? "yes" : "no",
        ].join(","),
      ),
    ].join("\n");

    return jsonResponse({
      markdown: renderPacket(appOrigin, supabaseUrl, providers, hostList),
      allowlistCsv,
    });
  }

  return jsonResponse({ error: "unknown_action" }, { status: 400 });
});
