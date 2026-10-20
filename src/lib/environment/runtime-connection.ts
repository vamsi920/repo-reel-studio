import type { ConnectorManifest } from "./types/capability";

/**
 * Connecting a provider that lives on the customer's private network.
 *
 * The onboarding case study (case-studies/onboarding, "Northwind Bank") found
 * that a self-managed GitLab or Jira Data Center on an internal hostname could
 * not be connected at all: the form refused `*.internal` and RFC 1918 hosts
 * (an SSRF guard for the Edge Function), and the Edge Function could not reach
 * them anyway. The only machine that can is the one running the agent, inside
 * the company network and behind its proxy. So for these hosts the Edge
 * Function still stores the encrypted credential (and still refuses to call
 * the host), and the check runs from the agent-server instead.
 *
 * Pure: builds the command and reads its output. The service that runs it is
 * `src/services/runtime-connection-check.ts`.
 */

/** Hostnames that only resolve inside a company network. */
const PRIVATE_NETWORK_PATTERNS: RegExp[] = [
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /\.(internal|local|corp|lan|intranet|intra|home\.arpa)$/i,
];

/** Never allowed, private network or not: these reach the host itself. */
const NEVER_ALLOWED_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^169\.254\./,
  /^metadata(\.|$)/i,
  /^metadata\.google\.internal$/i,
];

function bareHost(host: string): string {
  return host
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split(":")[0];
}

/**
 * True for a company-internal host the agent's runtime can reach but the
 * cloud cannot: `gitlab.bank.internal`, `jira.corp`, `10.2.3.4`, or a
 * single-label intranet name (`gitlab`). Loopback, link-local and cloud
 * metadata hosts are never private-network hosts.
 */
export function isPrivateNetworkHost(host: string): boolean {
  const bare = bareHost(host);
  if (!bare || bare.includes("[")) return false;
  if (NEVER_ALLOWED_PATTERNS.some((pattern) => pattern.test(bare))) {
    return false;
  }
  if (PRIVATE_NETWORK_PATTERNS.some((pattern) => pattern.test(bare))) {
    return true;
  }
  return /^[a-z0-9-]+$/.test(bare) && !/^\d+$/.test(bare);
}

/** `gitlab-self-managed` + `accessToken` -> `GITLAB_SELF_MANAGED_ACCESS_TOKEN`. */
export function connectionEnvName(
  providerId: string,
  fieldName: string,
): string {
  const snake = (value: string) =>
    value
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toUpperCase();
  return `${snake(providerId)}_${snake(fieldName)}`.slice(0, 64);
}

/**
 * The environment variables a connection is exposed as to the agent: every
 * secret field and every config field (a host is useless without its token).
 */
export function connectionEnvValues(
  manifest: ConnectorManifest,
  config: Record<string, string>,
  credentials: Record<string, string>,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of manifest.fields) {
    const value = field.secret ? credentials[field.name] : config[field.name];
    if (value) values[connectionEnvName(manifest.id, field.name)] = value;
  }
  return values;
}

/** The private host a self-hosted connection points at, if any. */
export function privateHostOf(
  manifest: ConnectorManifest,
  config: Record<string, string>,
): string | null {
  const field = manifest.hostOverride?.field;
  const host = field ? config[field] : undefined;
  return host && isPrivateNetworkHost(host) ? bareHost(host) : null;
}

function interpolate(template: string, config: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    encodeURIComponent(config[name] ?? ""),
  );
}

/**
 * Probe URLs to try, most secure first. An internal service reached through
 * a TLS-inspecting proxy may only answer over plain HTTP on some networks;
 * the caller reports that as a warning rather than a silent success.
 */
export function runtimeProbeUrls(
  manifest: ConnectorManifest,
  config: Record<string, string>,
): string[] {
  const template = manifest.hostOverride?.baseUrlTemplate ?? manifest.baseUrl;
  if (!template) return [];
  const host = config[manifest.hostOverride?.field ?? ""] ?? "";
  const base = interpolate(
    template,
    // A host typed with a scheme or path is reduced to the host.
    { ...config, [manifest.hostOverride?.field ?? ""]: bareHost(host) },
  ).replace(/%3A/gi, ":");
  const path = interpolate(manifest.probe.request.pathTemplate, config);
  const https = `${base.replace(/^http:\/\//, "https://")}${path}`;
  return [https, https.replace(/^https:\/\//, "http://")];
}

/** Header lines for the probe, in the manifest's auth style. */
export function runtimeAuthHeaderLines(
  manifest: ConnectorManifest,
  credentials: Record<string, string>,
): string[] {
  const token =
    credentials.accessToken ??
    credentials.token ??
    credentials.apiToken ??
    credentials.apiKey ??
    "";
  const extra = Object.entries(manifest.probe.request.headers ?? {}).map(
    ([name, value]) => `${name}: ${value}`,
  );
  switch (manifest.authKind) {
    case "basic": {
      const user = credentials.username ?? "";
      const pass = credentials.password ?? credentials.apiToken ?? "";
      return [`Authorization: Basic ${btoa(`${user}:${pass}`)}`, ...extra];
    }
    case "none":
      return extra;
    default:
      return [`Authorization: Bearer ${token}`, ...extra];
  }
}

/** Single-quotes a value for a POSIX shell. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export const RUNTIME_PROBE_BODY_MARKER = "---NEODEVEX-PROBE-BODY---";

/**
 * One curl call. The credential is read from `headerFile` (`-H @file`), so it
 * never appears in the command line, the runtime's bash history, or the
 * agent-server's bash event log. curl honours the host's own
 * `HTTPS_PROXY`/`http_proxy`/`NO_PROXY` and CA settings, which is the point:
 * this is the network the agent will actually use.
 */
export function buildRuntimeProbeCommand(args: {
  url: string;
  method: string;
  headerFile: string;
  bodyFile: string;
  errorFile: string;
}): string {
  const { url, method, headerFile, bodyFile, errorFile } = args;
  return [
    `code=$(curl -sS -m 12 -X ${shellQuote(method)} -o ${shellQuote(bodyFile)} -w '%{http_code}' -H @${shellQuote(headerFile)} ${shellQuote(url)} 2>${shellQuote(errorFile)})`,
    `rc=$?`,
    `printf 'RC=%s CODE=%s\\n' "$rc" "$code"`,
    `head -c 300 ${shellQuote(errorFile)} 2>/dev/null`,
    `printf '\\n${RUNTIME_PROBE_BODY_MARKER}\\n'`,
    `head -c 8000 ${shellQuote(bodyFile)} 2>/dev/null`,
    `rm -f ${shellQuote(bodyFile)} ${shellQuote(errorFile)}`,
  ].join("; ");
}

export type RuntimeProbeFailure =
  | "dns"
  | "unreachable"
  | "timeout"
  | "tls_untrusted"
  | "proxy_auth"
  | "unauthorized"
  | "forbidden"
  | "unexpected_status"
  | "check_failed";

export interface RuntimeProbeAttempt {
  url: string;
  ok: boolean;
  httpStatus: number | null;
  failure?: RuntimeProbeFailure;
  checks: { id: string; ok: boolean }[];
  version?: string;
}

function readPointer(body: unknown, pointer: string): unknown {
  return pointer
    .split("/")
    .slice(1)
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === "object"
          ? (value as Record<string, unknown>)[key]
          : undefined,
      body,
    );
}

const CURL_FAILURES: Record<number, RuntimeProbeFailure> = {
  5: "dns",
  6: "dns",
  7: "unreachable",
  28: "timeout",
  35: "tls_untrusted",
  51: "tls_untrusted",
  58: "tls_untrusted",
  60: "tls_untrusted",
  77: "tls_untrusted",
  97: "proxy_auth",
};

/** Reads one `buildRuntimeProbeCommand` run against the manifest's checks. */
export function evaluateRuntimeProbe(
  manifest: ConnectorManifest,
  url: string,
  stdout: string,
): RuntimeProbeAttempt {
  const [head, ...rest] = stdout.split(RUNTIME_PROBE_BODY_MARKER);
  const match = head.match(/RC=(\d+) CODE=(\d{3})?/);
  const rc = match ? Number(match[1]) : -1;
  const status = match?.[2] ? Number(match[2]) : null;
  const httpStatus = status && status > 0 ? status : null;

  if (rc !== 0 || httpStatus === null) {
    const failure: RuntimeProbeFailure =
      CURL_FAILURES[rc] ??
      (/proxy/i.test(head) && /407/.test(head) ? "proxy_auth" : "unreachable");
    return { url, ok: false, httpStatus, failure, checks: [] };
  }
  if (httpStatus === 407) {
    return { url, ok: false, httpStatus, failure: "proxy_auth", checks: [] };
  }

  let body: unknown;
  try {
    body = JSON.parse(rest.join(RUNTIME_PROBE_BODY_MARKER).trim());
  } catch {
    body = undefined;
  }
  const checks = manifest.probe.checks.map((check) => {
    if (check.kind === "status-in") {
      return { id: check.id, ok: check.statuses.includes(httpStatus) };
    }
    if (check.kind === "json-pointer-present") {
      const value = readPointer(body, check.pointer);
      return { id: check.id, ok: value !== undefined && value !== null };
    }
    if (check.kind === "json-pointer-equals") {
      return {
        id: check.id,
        ok: readPointer(body, check.pointer) === check.value,
      };
    }
    // Response headers are not captured; the status check still applies.
    return { id: check.id, ok: true };
  });
  const ok = checks.every((check) => check.ok);
  const versionSource = manifest.probe.versionSource;
  const version =
    versionSource?.from === "json"
      ? readPointer(body, versionSource.pointer)
      : undefined;

  let failure: RuntimeProbeFailure | undefined;
  if (!ok) {
    if (httpStatus === 401) failure = "unauthorized";
    else if (httpStatus === 403) failure = "forbidden";
    else if (httpStatus >= 300) failure = "unexpected_status";
    else failure = "check_failed";
  }
  return {
    url,
    ok,
    httpStatus,
    ...(failure ? { failure } : {}),
    checks,
    ...(typeof version === "string" ? { version } : {}),
  };
}

/** What to tell the user for a failure, in one line the agent can relay. */
export const RUNTIME_PROBE_ADVICE: Record<RuntimeProbeFailure, string> = {
  dns: "The agent's host cannot resolve this hostname. It needs the company DNS, or the proxy set as HTTPS_PROXY/http_proxy on that host.",
  unreachable:
    "The agent's host cannot open a connection. Usually the corporate proxy is not configured on it (HTTPS_PROXY / http_proxy / NO_PROXY), or a firewall blocks it.",
  timeout:
    "The request timed out. Check the proxy settings and firewall rules on the agent's host.",
  tls_untrusted:
    "TLS failed, typically because a TLS-inspecting proxy re-signs traffic. Install the corporate root CA on the agent's host (SSL_CERT_FILE / CURL_CA_BUNDLE / REQUESTS_CA_BUNDLE).",
  proxy_auth:
    "The proxy asked for credentials (407). The proxy URL on the agent's host needs a service account.",
  unauthorized:
    "The server rejected the token (401). It may be wrong, expired, or lack API scope.",
  forbidden:
    "The token is valid but lacks permission (403). It needs read API scope.",
  unexpected_status:
    "The server answered with an unexpected status. The host may be wrong, or this is not the expected product/version.",
  check_failed:
    "The server answered but not like this product's API. Check the host.",
};
