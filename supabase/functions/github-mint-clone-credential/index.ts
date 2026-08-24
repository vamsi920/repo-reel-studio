import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, getCallerUserId } from "../_shared/supabase-admin.ts";
import { githubApiBaseUrl } from "../_shared/github.ts";

/**
 * One-shot handoff: returns the decrypted GitHub token so the browser can
 * immediately save it into the self-hosted agent-server's own secret store
 * (SecretsService.createSecret) to clone a repo into the sandbox. The
 * self-hosted agent-server has no route back to Supabase, so this brief
 * browser pass-through is the only way to reach it -- accepted tradeoff,
 * see the plan doc. Callers must not persist or log the returned token.
 */
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
  const { data: connection } = await admin
    .from("github_connections")
    .select("enterprise_host, encrypted_access_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (!connection) {
    return jsonResponse({ error: "not_connected" }, { status: 404 });
  }

  const encryptionKey = Deno.env.get("GITHUB_TOKEN_ENCRYPTION_KEY");
  if (!encryptionKey) {
    return jsonResponse({ error: "encryption_not_configured" }, { status: 500 });
  }

  const { data: token, error: decryptError } = await admin.rpc(
    "decrypt_github_token",
    {
      ciphertext: connection.encrypted_access_token,
      encryption_key: encryptionKey,
    },
  );
  if (decryptError || !token) {
    return jsonResponse({ error: "decryption_failed" }, { status: 500 });
  }

  const apiBase = githubApiBaseUrl(connection.enterprise_host);
  const cloneHost = new URL(apiBase).hostname.replace(/^api\./, "");

  return jsonResponse({ token, host: cloneHost });
});
