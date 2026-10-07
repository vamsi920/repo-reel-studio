import { jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { decryptJson } from "../_shared/secrets.ts";
import { getConnectorManifest } from "../_shared/connector-registry/index.ts";
import { refreshIfNeeded } from "../_shared/connection-refresh.ts";
import { runConnectorProbe } from "../_shared/probe-runner.ts";
import { statusFromProbe } from "../_shared/connection-health.ts";
import { recordConnectionEvents } from "../_shared/connection-sync.ts";

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
// Edge Functions are cut off at ~150 s wall time. Stop picking up new batches
// well before that; whatever is left is first in line next hour (the query
// orders by oldest probe first).
const TIME_BUDGET_MS = 110_000;

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("X-Cron-Secret") !== cronSecret) {
    return jsonResponse({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const startedAt = Date.now();
  const refreshBefore = new Date(startedAt + REFRESH_WINDOW_MS).toISOString();
  const probeBefore = new Date(startedAt - REPROBE_AFTER_MS).toISOString();

  // Rows already handled this run. A row whose refresh failed transiently
  // (provider 5xx) keeps matching the query; without this it would be picked
  // up again by every following batch until the time budget ran out.
  const seen = new Set<string>();

  let scanned = 0;
  let refreshed = 0;
  let probed = 0;
  let failed = 0;
  let batches = 0;
  let exhausted = false;

  while (Date.now() - startedAt < TIME_BUDGET_MS) {
    // Already-dead connections are skipped: re-probing them every hour only
    // burns provider quota until the user reconnects.
    let query = admin
      .from("connections")
      .select("*")
      .not("status", "in", "(expired,revoked)")
      .or(
        `expires_at.lt.${refreshBefore},last_probe_at.is.null,last_probe_at.lt.${probeBefore}`,
      )
      .order("last_probe_at", { ascending: true, nullsFirst: true })
      .limit(BATCH_LIMIT);
    if (seen.size > 0) {
      query = query.not("id", "in", `(${[...seen].join(",")})`);
    }
    const { data: rows, error } = await query;
    if (error) {
      if (batches === 0) return jsonResponse({ error: "query_failed" }, { status: 500 });
      break;
    }
    const batch = (rows ?? []) as Record<string, unknown>[];
    batches += 1;
    if (batch.length === 0) {
      exhausted = true;
      break;
    }

    for (const connection of batch) {
      seen.add(connection.id as string);
      scanned += 1;
      if (Date.now() - startedAt >= TIME_BUDGET_MS) break;
      try {
        const outcome = await sweepOne(admin, connection, probeBefore);
        if (outcome.refreshed) refreshed += 1;
        if (outcome.probed) probed += 1;
      } catch {
        failed += 1;
      }
    }

    if (batch.length < BATCH_LIMIT) {
      exhausted = true;
      break;
    }
  }

  return jsonResponse({
    ok: true,
    scanned,
    refreshed,
    probed,
    failed,
    batches,
    // false means the time budget ran out with rows still due; they are
    // first in line on the next run.
    complete: exhausted,
  });
});

async function sweepOne(
  admin: ReturnType<typeof createAdminClient>,
  connection: Record<string, unknown>,
  probeBefore: string,
): Promise<{ refreshed: boolean; probed: boolean }> {
  const manifest = getConnectorManifest(connection.provider_id as string);
  if (!manifest) return { refreshed: false, probed: false };

  let credentials: Record<string, string> = {};
  if (connection.encrypted_credentials) {
    credentials = await decryptJson(admin, connection.encrypted_credentials as string);
  }

  const before = credentials.accessToken;
  credentials = await refreshIfNeeded(admin, connection, manifest, credentials, {
    windowMs: REFRESH_WINDOW_MS,
  });
  const refreshed = credentials.accessToken !== before;

  const lastProbeAt = connection.last_probe_at as string | null;
  const due = !lastProbeAt || lastProbeAt < probeBefore;
  if (!due) return { refreshed, probed: false };

  // The refresh above may have just marked the row expired; do not overwrite
  // that verdict with a probe made on the old token.
  const { data: current } = await admin
    .from("connections")
    .select("status")
    .eq("id", connection.id as string)
    .maybeSingle();
  if (current && (current.status === "expired" || current.status === "revoked")) {
    return { refreshed, probed: false };
  }

  const result = await runConnectorProbe(
    manifest,
    (connection.config as Record<string, string>) ?? {},
    credentials,
  );
  const status = statusFromProbe(
    result,
    Boolean((manifest.oauth as { refreshable?: boolean } | undefined)?.refreshable),
  );
  await admin
    .from("connections")
    .update({
      status,
      granted_scopes: result.grantedScopes ?? connection.granted_scopes,
      last_probe: result,
      last_probe_at: result.probedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id as string);

  if (current && current.status !== status) {
    await recordConnectionEvents(admin, [
      {
        orgId: connection.org_id as string,
        providerId: connection.provider_id as string,
        instanceKey: (connection.instance_key as string) ?? "default",
        action: "status_changed",
        status,
        detail: {
          from: current.status,
          via: "health_sweep",
          remediation: result.remediation?.codeKey ?? null,
        },
      },
    ]);
  }
  return { refreshed, probed: true };
}
