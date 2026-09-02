import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";

const MIN_PASSWORD_LENGTH = 8;

/**
 * POC-only self-service password change: sets a user's password directly
 * from their email, with no proof of identity beyond "the address is on
 * the domain allowlist". It exists because this deployment has no working
 * outbound email (no custom SMTP configured -- see requestPasswordReset in
 * auth-flow.ts), so the normal emailed-link reset is unusable and two
 * different people have been locked out by it.
 *
 * This is a real, deliberate downgrade from a verified reset: anyone who
 * knows a colleague's @neodevex.com address can take over that account.
 * Acceptable only because every account on this deployment is itself a
 * NeoDevEx-internal proof-of-concept user -- do not carry this forward once
 * real customer accounts exist, and revisit once SMTP is configured so the
 * verified emailed-link flow (already built, just unused) can take back
 * over.
 *
 * Entered by a browser with NO session at all -- that is the entire point
 * (the user is locked out) -- so this must stay public (see config.toml).
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  let payload: { email?: string; newPassword?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_body" }, { status: 400 });
  }

  const email = payload.email?.trim().toLowerCase() ?? "";
  const newPassword = payload.newPassword ?? "";
  const at = email.lastIndexOf("@");
  if (at <= 0) {
    return jsonResponse({ error: "invalid_email" }, { status: 400 });
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return jsonResponse({ error: "password_too_short" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fail closed: an empty allowlist means "no restriction" everywhere else
  // in the app (a fresh install shouldn't lock itself out of signup), but
  // this endpoint skips all identity proof, so an empty table here must
  // mean "nobody", not "everybody".
  const { data: allowlist, error: allowlistError } = await admin
    .from("signup_domain_allowlist")
    .select("domain");
  if (allowlistError) {
    return jsonResponse({ error: "allowlist_unavailable" }, { status: 500 });
  }
  const domains = (allowlist ?? []).map((row) =>
    String((row as { domain: unknown }).domain ?? "").trim().toLowerCase(),
  );
  const emailDomain = email.slice(at + 1);
  if (domains.length === 0 || !domains.includes(emailDomain)) {
    return jsonResponse({ error: "domain_rejected" }, { status: 403 });
  }

  // supabase-js's admin API has no lookup-by-email; GoTrue's admin REST
  // endpoint does (`?email=`), so this one lookup goes direct.
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lookupRes = await fetch(
    `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } },
  );
  if (!lookupRes.ok) {
    return jsonResponse({ error: "lookup_failed" }, { status: 502 });
  }
  const lookupBody = (await lookupRes.json()) as { users?: { id: string }[] };
  const user = lookupBody.users?.[0];
  if (!user) {
    return jsonResponse({ error: "no_account" }, { status: 404 });
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(
    user.id,
    { password: newPassword },
  );
  if (updateError) {
    return jsonResponse({ error: "update_failed" }, { status: 502 });
  }

  return jsonResponse({ ok: true });
});
