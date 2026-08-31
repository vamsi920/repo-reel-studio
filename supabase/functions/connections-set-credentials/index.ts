import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, getCallerUserId } from "../_shared/supabase-admin.ts";
import { getCallerOrgId, requireOrgRole } from "../_shared/org.ts";
import { encryptJson, fingerprint } from "../_shared/secrets.ts";
import {
  getConnectorManifest,
  secretFieldNames,
} from "../_shared/connector-registry/index.ts";
import { runConnectorProbe } from "../_shared/probe-runner.ts";

/**
 * The only path a credential ever takes into this system.
 *
 * The browser posts here directly from the field it was typed into. The value
 * does not pass through the agent transcript, the event store, a query cache
 * or any log line, and what comes back -- a receipt -- has no field a
 * plaintext credential could occupy.
 */

type Redaction = "full" | "last4" | "domain-only";

const MASK = "•";

function redact(value: string, rule: Redaction | undefined): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (rule === "last4") {
    return trimmed.length <= 4
      ? MASK.repeat(trimmed.length)
      : `${MASK.repeat(4)}${trimmed.slice(-4)}`;
  }
  if (rule === "domain-only") {
    const at = trimmed.lastIndexOf("@");
    return at >= 0 ? `${MASK.repeat(4)}@${trimmed.slice(at + 1)}` : MASK.repeat(8);
  }
  // Default is total masking: a manifest author who forgets `redact` fails
  // closed rather than leaking four characters of a signing key.
  return MASK.repeat(8);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const userId = await getCallerUserId(req);
  if (!userId) return jsonResponse({ error: "unauthorized" }, { status: 401 });

  let payload: {
    action?: string;
    capability?: string;
    providerId?: string;
    instanceKey?: string;
    displayName?: string;
    config?: Record<string, string>;
    credentials?: Record<string, string>;
  };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_body" }, { status: 400 });
  }

  if (payload.action !== "set") {
    return jsonResponse({ error: "unknown_action" }, { status: 400 });
  }

  const manifest = payload.providerId
    ? getConnectorManifest(payload.providerId)
    : undefined;
  if (!manifest) {
    return jsonResponse({ error: "unknown_provider" }, { status: 400 });
  }

  const admin = createAdminClient();
  const orgId = await getCallerOrgId(admin, userId);
  if (!orgId) return jsonResponse({ error: "no_org" }, { status: 403 });

  // Choosing what the organisation's agents connect to is an administrative
  // act, not a personal preference.
  if (!(await requireOrgRole(admin, userId, orgId, "admin"))) {
    return jsonResponse({ error: "forbidden" }, { status: 403 });
  }

  const allowedSecrets = new Set(secretFieldNames(manifest));
  const allowedConfig = new Set(
    manifest.fields.filter((field) => !field.secret).map((field) => field.name),
  );

  const credentials: Record<string, string> = {};
  for (const [name, value] of Object.entries(payload.credentials ?? {})) {
    // Reject anything the manifest does not declare rather than storing it.
    // Without this a caller could smuggle arbitrary blobs into the encrypted
    // column and use this table as opaque storage.
    if (!allowedSecrets.has(name)) {
      return jsonResponse({ error: "unknown_field", field: name }, { status: 400 });
    }
    if (typeof value !== "string") {
      return jsonResponse({ error: "invalid_field", field: name }, { status: 400 });
    }
    credentials[name] = value;
  }

  const config: Record<string, string> = {};
  for (const [name, value] of Object.entries(payload.config ?? {})) {
    if (!allowedConfig.has(name)) {
      return jsonResponse({ error: "unknown_field", field: name }, { status: 400 });
    }
    config[name] = String(value);
  }

  for (const field of manifest.fields) {
    const required =
      field.required === true ||
      (typeof field.required === "object" &&
        config[field.required.whenFieldEquals[0]] ===
          field.required.whenFieldEquals[1]);
    if (!required) continue;
    const present = field.secret ? credentials[field.name] : config[field.name];
    if (!present) {
      return jsonResponse(
        { error: "missing_field", field: field.name },
        { status: 400 },
      );
    }
  }

  const redactedSummary: Record<string, string> = {};
  for (const field of manifest.fields) {
    const value = field.secret ? credentials[field.name] : config[field.name];
    if (!value) continue;
    redactedSummary[field.name] = field.secret
      ? redact(value, field.redact as Redaction | undefined)
      : value;
  }

  let encrypted: string | null = null;
  let credentialFingerprint: string | null = null;
  if (Object.keys(credentials).length > 0) {
    try {
      encrypted = await encryptJson(admin, credentials);
    } catch (error) {
      return jsonResponse(
        { error: (error as Error).message ?? "encryption_failed" },
        { status: 500 },
      );
    }
    credentialFingerprint = await fingerprint(Object.values(credentials).join(" "));
  }

  // Probe before reporting success. "Saved" and "works" are different claims,
  // and conflating them is how an install reaches production with a
  // credential that has never made a single successful call.
  const probe = await runConnectorProbe(manifest, config, credentials);
  const requestedScopes =
    (manifest.oauth as { scopes?: string[] } | undefined)?.scopes ?? [];
  const grantedScopes = probe.grantedScopes ?? [];
  const missingScopes = probe.missingScopes ?? [];

  const status = !probe.ok ? "error" : missingScopes.length > 0 ? "degraded" : "ok";

  const instanceKey = payload.instanceKey || "default";
  const { data, error } = await admin
    .from("connections")
    .upsert(
      {
        org_id: orgId,
        capability: manifest.capability,
        provider_id: manifest.id,
        instance_key: instanceKey,
        display_name: payload.displayName ?? null,
        config,
        encrypted_credentials: encrypted,
        credential_fingerprint: credentialFingerprint,
        redacted_summary: redactedSummary,
        requested_scopes: requestedScopes,
        granted_scopes: grantedScopes,
        status,
        last_probe: probe,
        last_probe_at: probe.probedAt,
        created_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,capability,provider_id,instance_key" },
    )
    .select("id")
    .single();

  if (error || !data) {
    return jsonResponse(
      { error: "upsert_failed", detail: error?.message },
      { status: 500 },
    );
  }

  await admin.from("environment_checks").insert({
    org_id: orgId,
    kind: "connection",
    target: `${manifest.id}:${instanceKey}`,
    vantage: probe.vantage,
    ok: probe.ok,
    latency_ms: probe.latencyMs,
    checks: probe.checks,
    remediation: probe.remediation ?? null,
    actor: userId,
  });

  return jsonResponse({
    connectionId: data.id as string,
    capability: manifest.capability,
    providerId: manifest.id,
    instanceKey,
    status,
    fingerprint: credentialFingerprint ?? "",
    redacted: redactedSummary,
    grantedScopes,
    missingScopes,
    probe,
  });
});
