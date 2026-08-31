import type { ConnectorManifest } from "./connector-registry/index.ts";
import {
  interpolateHeaders,
  interpolatePath,
  interpolateValue,
  resolveBaseUrl,
  TemplateError,
  type TemplateContext,
} from "./template.ts";

/** Matches PROBE_TIMEOUT_MS in src/hooks/query/use-backends-health.ts. */
const PROBE_TIMEOUT_MS = 4000;

export interface ProbeCheck {
  id: string;
  ok: boolean;
  labelKey: string;
  detail?: string;
  observed?: string | number;
  expected?: string | number;
}

export interface ProbeResult {
  ok: boolean;
  vantage: "browser" | "edge" | "runtime";
  latencyMs: number;
  checks: ProbeCheck[];
  remediation?: {
    codeKey: string;
    steps: { kind: string; targetKey: string; value?: string }[];
    agentActionable: boolean;
  };
  grantedScopes?: string[];
  missingScopes?: string[];
  serverVersion?: string;
  clockSkewMs?: number;
  probedAt: string;
}

function readPointer(body: unknown, pointer: string): unknown {
  // RFC 6901-ish: "/a/0/b". Enough for the manifests, without pulling a dep.
  const parts = pointer.split("/").filter(Boolean);
  let current: unknown = body;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number.parseInt(part, 10);
      if (Number.isNaN(index)) return undefined;
      current = current[index];
    } else if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Applies the auth style the manifest declares.
 *
 * Every one of these puts the credential in a header. That is not an
 * accident: the template interpolator refuses to place a secret field into a
 * URL, so a manifest cannot express "pass the key as a query parameter" even
 * if the vendor's documentation suggests it.
 */
function authHeaders(
  manifest: ConnectorManifest,
  credentials: Record<string, string>,
): Record<string, string> {
  switch (manifest.authKind) {
    case "oauth2-pkce":
    case "oauth2-client-credentials":
    case "bearer-token":
      return {
        Authorization: `Bearer ${credentials.accessToken ?? credentials.token ?? credentials.botToken ?? ""}`,
      };
    case "api-key": {
      // Vendors disagree about the header name; the manifest id decides.
      if (manifest.id === "pinecone") return { "Api-Key": credentials.apiKey ?? "" };
      if (manifest.id === "anthropic") return { "x-api-key": credentials.apiKey ?? "" };
      if (manifest.id === "google-gemini")
        return { "x-goog-api-key": credentials.apiKey ?? "" };
      if (manifest.id === "azure-openai") return { "api-key": credentials.apiKey ?? "" };
      if (manifest.id === "qdrant") return { "api-key": credentials.apiKey ?? "" };
      if (manifest.id === "elasticsearch")
        return { Authorization: `ApiKey ${credentials.apiKey ?? ""}` };
      if (manifest.id === "datadog")
        return {
          "DD-API-KEY": credentials.apiKey ?? "",
          ...(credentials.appKey ? { "DD-APPLICATION-KEY": credentials.appKey } : {}),
        };
      if (manifest.id === "okta") return { Authorization: `SSWS ${credentials.apiToken ?? ""}` };
      if (manifest.id === "linear")
        return { Authorization: credentials.apiKey ?? "" };
      return { Authorization: `Bearer ${credentials.apiKey ?? ""}` };
    }
    case "basic": {
      const user = credentials.username ?? "";
      const pass = credentials.password ?? credentials.apiToken ?? "";
      return { Authorization: `Basic ${btoa(`${user}:${pass}`)}` };
    }
    default:
      return {};
  }
}

function extractScopes(
  manifest: ConnectorManifest,
  response: Response,
  body: unknown,
): string[] | undefined {
  const spec = (manifest.probe as { scopeSource?: unknown }).scopeSource as
    | { from: "header"; name: string; separator: string }
    | { from: "json"; pointer: string; separator?: string }
    | undefined;
  if (!spec) return undefined;

  if (spec.from === "header") {
    const raw = response.headers.get(spec.name);
    if (!raw) return [];
    return raw
      .split(spec.separator)
      .map((scope) => scope.trim())
      .filter(Boolean);
  }

  const value = readPointer(body, spec.pointer);
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    return value
      .split(spec.separator ?? " ")
      .map((scope) => scope.trim())
      .filter(Boolean);
  }
  return [];
}

function extractVersion(
  manifest: ConnectorManifest,
  response: Response,
  body: unknown,
): string | undefined {
  const spec = (manifest.probe as { versionSource?: unknown }).versionSource as
    | { from: "header"; name: string }
    | { from: "json"; pointer: string }
    | undefined;
  if (!spec) return undefined;
  if (spec.from === "header") return response.headers.get(spec.name) ?? undefined;
  const value = readPointer(body, spec.pointer);
  return typeof value === "string" ? value : undefined;
}

function remediationForStatus(status: number) {
  if (status === 401) {
    return {
      codeKey: "PROBE$REMEDIATION_UNAUTHORIZED",
      steps: [{ kind: "console", targetKey: "PROBE$REMEDIATION_RECONNECT" }],
      agentActionable: false,
    };
  }
  if (status === 403) {
    return {
      codeKey: "PROBE$REMEDIATION_FORBIDDEN",
      steps: [{ kind: "console", targetKey: "PROBE$REMEDIATION_GRANT_SCOPES" }],
      agentActionable: false,
    };
  }
  if (status === 429) {
    return {
      codeKey: "PROBE$REMEDIATION_RATE_LIMITED",
      steps: [{ kind: "console", targetKey: "PROBE$REMEDIATION_WAIT" }],
      agentActionable: true,
    };
  }
  return undefined;
}

/**
 * Runs one connector's declared probe. No provider-specific code path exists
 * here: everything a vendor needs is in its manifest, which is what makes
 * "adding a connector" a data change.
 */
export async function runConnectorProbe(
  manifest: ConnectorManifest,
  config: Record<string, string>,
  credentials: Record<string, string>,
): Promise<ProbeResult> {
  const probedAt = new Date().toISOString();
  const context: TemplateContext = { config, credentials, params: {} };
  const started = Date.now();

  let url: string;
  try {
    const base = resolveBaseUrl(manifest, context);
    const spec = manifest.probe as {
      request: {
        method: string;
        pathTemplate: string;
        headers?: Record<string, string>;
        bodyTemplate?: string;
      };
    };
    url = `${base}${interpolatePath(spec.request.pathTemplate, context)}`;
  } catch (error) {
    const code = error instanceof TemplateError ? error.code : "probe_setup_failed";
    return {
      ok: false,
      vantage: "edge",
      latencyMs: 0,
      checks: [{ id: "setup", ok: false, labelKey: "PROBE$CHECK_REACHABLE", detail: code }],
      probedAt,
    };
  }

  const spec = manifest.probe as {
    request: {
      method: string;
      pathTemplate: string;
      headers?: Record<string, string>;
      bodyTemplate?: string;
    };
    checks: {
      id: string;
      labelKey: string;
      kind: string;
      statuses?: number[];
      pointer?: string;
      value?: unknown;
      header?: string;
    }[];
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: spec.request.method,
      headers: {
        Accept: "application/json",
        ...authHeaders(manifest, credentials),
        ...interpolateHeaders(spec.request.headers, context),
      },
      body: spec.request.bodyTemplate
        ? interpolateValue(spec.request.bodyTemplate, context)
        : undefined,
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    const checks: ProbeCheck[] = spec.checks.map((check) => {
      switch (check.kind) {
        case "status-in":
          return {
            id: check.id,
            labelKey: check.labelKey,
            ok: (check.statuses ?? []).includes(response.status),
            observed: response.status,
          };
        case "json-pointer-present":
          return {
            id: check.id,
            labelKey: check.labelKey,
            ok: readPointer(body, check.pointer ?? "") !== undefined,
          };
        case "json-pointer-equals":
          return {
            id: check.id,
            labelKey: check.labelKey,
            ok: readPointer(body, check.pointer ?? "") === check.value,
          };
        case "header-present":
          return {
            id: check.id,
            labelKey: check.labelKey,
            ok: response.headers.has(check.header ?? ""),
          };
        default:
          return { id: check.id, labelKey: check.labelKey, ok: false };
      }
    });

    const granted = extractScopes(manifest, response, body);
    const requested: string[] =
      ((manifest.oauth as { scopes?: string[] } | undefined)?.scopes ?? []);
    const missing = granted
      ? requested.filter((scope) => !granted.includes(scope))
      : undefined;

    // Rate-limit headroom is reported as a check rather than silently ignored:
    // a probe loop during onboarding is the likeliest thing to exhaust a
    // customer's API quota, and they should see it coming.
    const remaining = response.headers.get("x-ratelimit-remaining");
    if (remaining !== null) {
      checks.push({
        id: "rate-limit",
        labelKey: "PROBE$CHECK_RATE_LIMIT",
        ok: Number.parseInt(remaining, 10) > 0,
        observed: remaining,
      });
    }

    // Clock skew breaks OAuth iat/exp and webhook HMAC windows, and shows up
    // as intermittent 401s that look like a credential problem.
    const dateHeader = response.headers.get("date");
    const clockSkewMs = dateHeader
      ? new Date(dateHeader).getTime() - Date.now()
      : undefined;

    return {
      ok: checks.every((check) => check.ok),
      vantage: "edge",
      latencyMs,
      checks,
      remediation: remediationForStatus(response.status),
      grantedScopes: granted,
      missingScopes: missing,
      serverVersion: extractVersion(manifest, response, body),
      clockSkewMs,
      probedAt,
    };
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    return {
      ok: false,
      vantage: "edge",
      latencyMs: Date.now() - started,
      checks: [
        {
          id: "reachable",
          ok: false,
          labelKey: "PROBE$CHECK_REACHABLE",
          detail: aborted ? "timeout" : String((error as Error)?.message ?? error),
        },
      ],
      remediation: {
        codeKey: "PROBE$REMEDIATION_UNREACHABLE",
        steps: [{ kind: "network", targetKey: "PROBE$REMEDIATION_ALLOW_HOST", value: url }],
        agentActionable: false,
      },
      probedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}
