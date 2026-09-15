/**
 * The `{{field}}` interpolator used to turn a manifest's templated URL, header
 * and body strings into real requests.
 *
 * The load-bearing rule is in `interpolatePath`: a secret field may never be
 * substituted into a URL. URLs end up in access logs, proxy logs, browser
 * history and error reports; a credential in a query string has effectively
 * been published. Manifest authors cannot opt out of this, because the check
 * lives here rather than in a review guideline.
 */

export class TemplateError extends Error {
  readonly code: string;

  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

export interface TemplateContext {
  /** Non-secret values: hosts, regions, index names, ids. */
  config: Record<string, string>;
  /** Secret values. Permitted in headers and bodies only. */
  credentials: Record<string, string>;
  /** Caller-supplied operation parameters, already allowlisted. */
  params: Record<string, string>;
}

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

function lookup(name: string, context: TemplateContext, allowSecrets: boolean): string {
  if (name in context.params) return context.params[name];
  if (name in context.config) return context.config[name];
  if (name in context.credentials) {
    if (!allowSecrets) {
      throw new TemplateError(
        "secret_in_url",
        `refusing to interpolate the secret field "${name}" into a URL`,
      );
    }
    return context.credentials[name];
  }
  throw new TemplateError("unknown_placeholder", `unknown placeholder "${name}"`);
}

/** Interpolates a URL path or query. Secrets are refused outright. */
export function interpolatePath(template: string, context: TemplateContext): string {
  return template.replace(PLACEHOLDER, (_match, name: string) =>
    encodeURI(lookup(name, context, false)),
  );
}

/** Interpolates a header or body. Secrets are permitted here. */
export function interpolateValue(template: string, context: TemplateContext): string {
  return template.replace(PLACEHOLDER, (_match, name: string) =>
    lookup(name, context, true),
  );
}

export function interpolateHeaders(
  headers: Record<string, string> | undefined,
  context: TemplateContext,
): Record<string, string> {
  if (!headers) return {};
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      interpolateValue(value, context),
    ]),
  );
}

/**
 * Addresses a self-hosted override must never resolve to.
 *
 * Host override fields exist so a customer can point a connector at their own
 * GitLab. Without this list the same field aims the server-side proxy at
 * 169.254.169.254 and reads the deployment's cloud credentials back out. The
 * browser checks this too, for immediate feedback; this copy is the one that
 * actually protects anything.
 */
const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/i,
  /^169\.254\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /\.internal$/i,
  /\.local$/i,
  /^metadata(\.|$)/i,
];

/** Providers legitimately reached on loopback, beside the workload. */
const LOOPBACK_ALLOWED_PROVIDERS = new Set([
  "ollama",
  "litellm",
  "qdrant",
  "postgres",
  // `baseUrlEnv`-resolved: a local Supabase stack's SUPABASE_URL is
  // http://127.0.0.1:54321, not attacker-controlled input.
  "supabase-storage",
  "supabase-postgres",
  "supabase-pgvector",
]);

export function assertHostAllowed(urlString: string, providerId: string): void {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new TemplateError("invalid_url");
  }
  if (LOOPBACK_ALLOWED_PROVIDERS.has(providerId)) return;
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
    throw new TemplateError("blocked_host", `refusing to call ${host}`);
  }
}

/**
 * Resolves a manifest's base URL, honouring a self-hosted host override.
 *
 * `baseUrlEnv` is a last resort, for connectors that reuse this deployment's
 * own infrastructure (e.g. its own Supabase project) instead of a vendor's
 * public API or a user-supplied host: there is no literal to hardcode since
 * it differs per install, and nothing for the user to type in either.
 */
export function resolveBaseUrl(
  manifest: {
    id: string;
    baseUrl?: string;
    baseUrlEnv?: string;
    hostOverride?: { field: string; baseUrlTemplate: string };
  },
  context: TemplateContext,
): string {
  const overrideField = manifest.hostOverride?.field;
  const overrideValue = overrideField ? context.config[overrideField] : undefined;

  const base =
    overrideValue && manifest.hostOverride
      ? interpolatePath(manifest.hostOverride.baseUrlTemplate, context)
      : (manifest.baseUrl ??
        (manifest.baseUrlEnv ? readEnvVar(manifest.baseUrlEnv) : undefined));

  if (!base) throw new TemplateError("no_base_url");
  assertHostAllowed(base, manifest.id);
  return base.replace(/\/+$/, "");
}

/**
 * `Deno.env` in production; falls back to `process.env` so this file stays
 * importable under Vitest (`__tests__/lib/environment/probe-runner.test.ts`
 * loads it outside a Deno runtime).
 */
function readEnvVar(name: string): string | undefined {
  const denoEnv = (globalThis as { Deno?: { env: { get(name: string): string | undefined } } })
    .Deno?.env;
  if (denoEnv) return denoEnv.get(name);
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[
    name
  ];
}
