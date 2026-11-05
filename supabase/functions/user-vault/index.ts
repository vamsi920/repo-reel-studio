import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, getCallerUserId } from "../_shared/supabase-admin.ts";
import { decryptJson, encryptJson } from "../_shared/secrets.ts";

/**
 * Per-user encrypted state that has to follow the user across environments
 * but holds secrets (LLM profiles with their API keys). Rows in
 * `user_secret_state` are only readable through this function, which
 * encrypts with the same key and SQL helpers as connection credentials, and
 * only ever returns a row to its owner.
 */
const ALLOWED_KEYS = new Set(["llm_profiles"]);
const MAX_BYTES = 200_000;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }
  const userId = await getCallerUserId(req);
  if (!userId) return jsonResponse({ error: "unauthorized" }, { status: 401 });

  let payload: { action?: string; key?: string; value?: unknown };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_body" }, { status: 400 });
  }
  if (!payload.key || !ALLOWED_KEYS.has(payload.key)) {
    return jsonResponse({ error: "unknown_key" }, { status: 400 });
  }
  const admin = createAdminClient();

  if (payload.action === "get") {
    const { data, error } = await admin
      .from("user_secret_state")
      .select("ciphertext, updated_at")
      .eq("user_id", userId)
      .eq("key", payload.key)
      .maybeSingle();
    if (error) return jsonResponse({ error: "read_failed" }, { status: 500 });
    if (!data) return jsonResponse({ value: null });
    const decrypted = await decryptJson(admin, data.ciphertext as string);
    return jsonResponse({
      value: JSON.parse(decrypted.json ?? "null"),
      updatedAt: data.updated_at,
    });
  }

  if (payload.action === "put") {
    const json = JSON.stringify(payload.value ?? null);
    if (json.length > MAX_BYTES) {
      return jsonResponse({ error: "too_large" }, { status: 413 });
    }
    const ciphertext = await encryptJson(admin, { json });
    const { error } = await admin.from("user_secret_state").upsert({
      user_id: userId,
      key: payload.key,
      ciphertext,
      updated_at: new Date().toISOString(),
    });
    if (error) return jsonResponse({ error: "write_failed" }, { status: 500 });
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: "unknown_action" }, { status: 400 });
});
