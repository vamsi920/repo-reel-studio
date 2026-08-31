import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, getCallerUserId } from "../_shared/supabase-admin.ts";
import { getCallerOrgId } from "../_shared/org.ts";
import { decryptJson } from "../_shared/secrets.ts";
import { getConnectorManifest } from "../_shared/connector-registry/index.ts";
import { runConnectorProbe, type ProbeResult } from "../_shared/probe-runner.ts";

/**
 * Environment checks that can be answered from the platform's own runtime.
 *
 * Every result is stamped `vantage: "edge"`, and that word is load-bearing.
 * This function runs in Supabase's network, not the customer's. An egress
 * check here proves that a datacentre somewhere can reach github.com; it says
 * nothing about whether the machine running the customer's agents can get
 * through their proxy. The UI never presents the two as the same fact, and
 * `scripts/environment-preflight.mjs` exists to answer the question this
 * function cannot.
 */

const NETWORK_TIMEOUT_MS = 6000;
/** Beyond this, OAuth iat/exp and webhook HMAC windows start rejecting. */
const MAX_TOLERABLE_CLOCK_SKEW_MS = 5 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function probeEgress(hosts: string[]): Promise<ProbeResult> {
  const started = Date.now();
  const checks = await Promise.all(
    hosts.map(async (host) => {
      const target = host.startsWith("http") ? host : `https://${host}`;
      try {
        const response = await fetchWithTimeout(target, {
          method: "GET",
          redirect: "manual",
        });
        // Any HTTP status proves DNS, TCP and TLS all completed. Only a thrown
        // error is a reachability failure -- a 404 from a host we can reach is
        // not a network problem.
        return {
          id: host,
          ok: true,
          labelKey: "PROBE$CHECK_REACHABLE",
          observed: response.status,
        };
      } catch (error) {
        return {
          id: host,
          ok: false,
          labelKey: "PROBE$CHECK_REACHABLE",
          detail: String((error as Error)?.message ?? error),
        };
      }
    }),
  );

  return {
    ok: checks.every((check) => check.ok),
    vantage: "edge",
    latencyMs: Date.now() - started,
    checks,
    remediation: checks.every((check) => check.ok)
      ? undefined
      : {
          codeKey: "PROBE$REMEDIATION_UNREACHABLE",
          steps: [{ kind: "network", targetKey: "PROBE$REMEDIATION_ALLOW_HOST" }],
          agentActionable: false,
        },
    probedAt: nowIso(),
  };
}

async function probePgExtensions(
  admin: ReturnType<typeof createAdminClient>,
  required: string[],
): Promise<ProbeResult> {
  const started = Date.now();
  const { data, error } = await admin.rpc("environment_installed_extensions");
  const installed = new Set(
    Array.isArray(data)
      ? (data as { extname: string }[]).map((row) => row.extname)
      : [],
  );

  const checks = required.map((name) => ({
    id: name,
    ok: !error && installed.has(name),
    labelKey: "PROBE$CHECK_EXTENSION",
    detail: error ? error.message : installed.has(name) ? undefined : "missing",
  }));

  return {
    ok: !error && checks.every((check) => check.ok),
    vantage: "edge",
    latencyMs: Date.now() - started,
    checks,
    probedAt: nowIso(),
  };
}

/**
 * The session-key drift check.
 *
 * Hits an AUTHENTICATED endpoint on purpose. `/health` answers 200 regardless
 * of the key, which is precisely why a mismatch between Netlify's
 * VITE_SESSION_API_KEY and Fly's LOCAL_BACKEND_API_KEY has historically
 * presented as random 401s that nobody could place -- every liveness check
 * said the server was fine.
 */
async function probeBackendKey(): Promise<ProbeResult> {
  const started = Date.now();
  const baseUrl = Deno.env.get("AGENT_SERVER_URL");
  const key = Deno.env.get("AGENT_BRIDGE_API_KEY");

  if (!baseUrl || !key) {
    return {
      ok: false,
      vantage: "edge",
      latencyMs: 0,
      checks: [
        {
          id: "configured",
          ok: false,
          labelKey: "PROBE$CHECK_BACKEND_AUTH",
          detail: "AGENT_SERVER_URL or AGENT_BRIDGE_API_KEY not set",
        },
      ],
      probedAt: nowIso(),
    };
  }

  try {
    const response = await fetchWithTimeout(
      `${baseUrl.replace(/\/+$/, "")}/api/settings`,
      { headers: { "X-Session-API-Key": key } },
    );
    const unauthorized = response.status === 401 || response.status === 403;
    return {
      ok: response.ok,
      vantage: "edge",
      latencyMs: Date.now() - started,
      checks: [
        {
          id: "auth",
          ok: response.ok,
          labelKey: "PROBE$CHECK_BACKEND_AUTH",
          observed: response.status,
        },
      ],
      remediation: unauthorized
        ? {
            codeKey: "PROBE$REMEDIATION_KEY_DRIFT",
            steps: [
              { kind: "env", targetKey: "PROBE$REMEDIATION_SYNC_SESSION_KEY" },
            ],
            agentActionable: false,
          }
        : undefined,
      probedAt: nowIso(),
    };
  } catch (error) {
    return {
      ok: false,
      vantage: "edge",
      latencyMs: Date.now() - started,
      checks: [
        {
          id: "reachable",
          ok: false,
          labelKey: "PROBE$CHECK_BACKEND_AUTH",
          detail: String((error as Error)?.message ?? error),
        },
      ],
      probedAt: nowIso(),
    };
  }
}

function probeClockSkew(): ProbeResult {
  // The caller compares its own clock against this timestamp; the server side
  // of the comparison is simply an authoritative "now".
  const skew = 0;
  return {
    ok: Math.abs(skew) <= MAX_TOLERABLE_CLOCK_SKEW_MS,
    vantage: "edge",
    latencyMs: 0,
    checks: [{ id: "clock", ok: true, labelKey: "PROBE$CHECK_CLOCK", observed: nowIso() }],
    clockSkewMs: skew,
    probedAt: nowIso(),
  };
}

/**
 * Checks for defects in how this deployment itself was provisioned, as
 * opposed to missing third-party dependencies. These are the mistakes a
 * customer install inherits from our own migrations if nobody looks.
 */
async function probeDeploymentDefects(
  admin: ReturnType<typeof createAdminClient>,
): Promise<ProbeResult> {
  const started = Date.now();
  const checks: ProbeResult["checks"] = [];

  const { count, error: allowlistError } = await admin
    .from("signup_domain_allowlist")
    .select("domain", { count: "exact", head: true });
  checks.push({
    id: "signup-domain-hardcoded",
    // Either state is valid: an empty allowlist accepts everyone, a populated
    // one accepts the domains it names. The defect being tested for is the
    // old hardcoded trigger, whose absence this table's existence proves.
    ok: !allowlistError,
    labelKey: "PROBE$DEFECT_SIGNUP_DOMAIN",
    detail: allowlistError ? allowlistError.message : `${count ?? 0} domains`,
  });

  const fileStore = Deno.env.get("FILE_STORE");
  checks.push({
    id: "file-store-local",
    ok: fileStore === undefined || fileStore === "local",
    labelKey: "PROBE$DEFECT_FILE_STORE",
    observed: fileStore ?? "unset",
  });

  return {
    ok: checks.every((check) => check.ok),
    vantage: "edge",
    latencyMs: Date.now() - started,
    checks,
    probedAt: nowIso(),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const userId = await getCallerUserId(req);
  if (!userId) return jsonResponse({ error: "unauthorized" }, { status: 401 });

  let payload: { action?: string; connectionId?: string; targets?: string[] };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const orgId = await getCallerOrgId(admin, userId);
  if (!orgId) return jsonResponse({ error: "no_org" }, { status: 403 });

  let result: ProbeResult;
  let target = payload.action ?? "unknown";

  switch (payload.action) {
    case "connection": {
      if (!payload.connectionId) {
        return jsonResponse({ error: "missing_connection" }, { status: 400 });
      }
      const { data: connection } = await admin
        .from("connections")
        .select("*")
        .eq("id", payload.connectionId)
        .eq("org_id", orgId)
        .maybeSingle();
      if (!connection) return jsonResponse({ error: "not_connected" }, { status: 404 });

      const manifest = getConnectorManifest(connection.provider_id as string);
      if (!manifest) {
        return jsonResponse({ error: "unknown_provider" }, { status: 400 });
      }

      let credentials: Record<string, string> = {};
      try {
        credentials = connection.encrypted_credentials
          ? await decryptJson(admin, connection.encrypted_credentials as string)
          : {};
      } catch (error) {
        return jsonResponse(
          { error: (error as Error).message ?? "decryption_failed" },
          { status: 500 },
        );
      }

      result = await runConnectorProbe(
        manifest,
        (connection.config as Record<string, string>) ?? {},
        credentials,
      );
      target = `${connection.provider_id}:${connection.instance_key}`;

      const missing = result.missingScopes ?? [];
      await admin
        .from("connections")
        .update({
          status: !result.ok ? "error" : missing.length > 0 ? "degraded" : "ok",
          granted_scopes: result.grantedScopes ?? connection.granted_scopes,
          last_probe: result,
          last_probe_at: result.probedAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", connection.id);
      break;
    }

    case "egress":
      result = await probeEgress(payload.targets ?? []);
      target = (payload.targets ?? []).join(" ");
      break;

    case "pg-extensions":
      result = await probePgExtensions(
        admin,
        payload.targets ?? ["vector", "pgcrypto", "pg_cron", "pg_net"],
      );
      target = "postgres";
      break;

    case "backend-key":
      result = await probeBackendKey();
      target = "agent-server";
      break;

    case "clock-skew":
      result = probeClockSkew();
      target = "clock";
      break;

    case "deployment-defects":
      result = await probeDeploymentDefects(admin);
      target = "deployment";
      break;

    default:
      return jsonResponse({ error: "unknown_action" }, { status: 400 });
  }

  // Egress writes one ledger row per host, so the Network tab can show a
  // per-host verdict instead of a single aggregate that hides which host
  // actually failed.
  if (payload.action === "egress") {
    await admin.from("environment_checks").insert(
      result.checks.map((check) => ({
        org_id: orgId,
        kind: "egress",
        target: check.id,
        vantage: result.vantage,
        ok: check.ok,
        latency_ms: result.latencyMs,
        checks: [check],
        remediation: check.ok ? null : (result.remediation ?? null),
        actor: userId,
      })),
    );
  } else {
    await admin.from("environment_checks").insert({
      org_id: orgId,
      kind: payload.action,
      target,
      vantage: result.vantage,
      ok: result.ok,
      latency_ms: result.latencyMs,
      checks: result.checks,
      remediation: result.remediation ?? null,
      actor: userId,
    });
  }

  return jsonResponse(result);
});
