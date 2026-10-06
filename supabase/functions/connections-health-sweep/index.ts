import { jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { decryptJson } from "../_shared/secrets.ts";
import { getConnectorManifest } from "../_shared/connector-registry/index.ts";
import { refreshIfNeeded } from "../_shared/connection-refresh.ts";
import { runConnectorProbe } from "../_shared/probe-runner.ts";
import { statusFromProbe } from "../_shared/connection-health.ts";

/**
 * Hourly background check of every connection (pg_cron -> this function).
 *
 * Without it a connection only learns it is dead when somebody happens to use
 * it, so the Environment page, the onboarding agent and the repo picker all
 * said "connected" for a token that had been revoked days earlier. The sweep
 * does two things, both best-effort per row so one bad connection never
 * blocks the rest:
 *
 * 1. Refreshes refreshable OAuth tokens that expire within the next window,
 *    BEFORE they lapse, so nobody ever meets an expired token.
 * 2. Re-probes any connection not probed in the last day and records the
 *    verdict (`ok` / `degraded` / `expired` / `revoked` / `error`). Supabase
 *    Realtime then pushes the new status to every open tab, which is what
 *    puts the Reconnect banner on screen.
 *
 * Deployed with --no-verify-jwt (the pg_cron caller carries no Supabase
 * session) and gated by the same shared secret as `jira-webhook-renew`.
 */
const REFRESH_WINDOW_MS = 20 * 60_000;
const REPROBE_AFTER_MS = 24 * 60 * 60_000;
const BATCH_LIMIT = 100;

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("X-Cron-Secret") !== cronSecret) {
    return jsonResponse({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const refreshBefore = new Date(now + REFRESH_WINDOW_MS).toISOString();
  const probeBefore = new Date(now - REPROBE_AFTER_MS).toISOString();

  // Already-dead connections are skipped: re-probing them every hour only
  // burns provider quota until the user reconnects.
  const { data: rows, error } = await admin
    .from("connections")
    .select("*")
    .not("status", "in", "(expired,revoked)")
    .or(
      `expires_at.lt.${refreshBefore},last_probe_at.is.null,last_probe_at.lt.${probeBefore}`,
    )
    .order("last_probe_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_LIMIT);
  if (error) return jsonResponse({ error: "query_failed" }, { status: 500 });

  let refreshed = 0;
  let probed = 0;
  let failed = 0;
  for (const connection of (rows ?? []) as Record<string, unknown>[]) {
    try {
      const manifest = getConnectorManifest(connection.provider_id as string);
      if (!manifest) continue;

      let credentials: Record<string, string> = {};
      if (connection.encrypted_credentials) {
        credentials = await decryptJson(
          admin,
          connection.encrypted_credentials as string,
        );
      }

      const before = credentials.accessToken;
      credentials = await refreshIfNeeded(admin, connection, manifest, credentials, {
        windowMs: REFRESH_WINDOW_MS,
      });
      if (credentials.accessToken !== before) refreshed += 1;

      const lastProbeAt = connection.last_probe_at as string | null;
      const due = !lastProbeAt || lastProbeAt < probeBefore;
      if (!due) continue;

      // The refresh above may have just marked the row expired; do not
      // overwrite that verdict with a probe made on the old token.
      const { data: current } = await admin
        .from("connections")
        .select("status")
        .eq("id", connection.id as string)
        .maybeSingle();
      if (current && (current.status === "expired" || current.status === "revoked")) {
        continue;
      }

      const result = await runConnectorProbe(
        manifest,
        (connection.config as Record<string, string>) ?? {},
        credentials,
      );
      await admin
        .from("connections")
        .update({
          status: statusFromProbe(
            result,
            Boolean((manifest.oauth as { refreshable?: boolean } | undefined)?.refreshable),
          ),
          granted_scopes: result.grantedScopes ?? connection.granted_scopes,
          last_probe: result,
          last_probe_at: result.probedAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", connection.id as string);
      probed += 1;
    } catch {
      failed += 1;
    }
  }

  return jsonResponse({ ok: true, scanned: (rows ?? []).length, refreshed, probed, failed });
});
