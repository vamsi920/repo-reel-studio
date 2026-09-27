import type {
  ConnectorField,
  ConnectorFieldError,
  ConnectorManifest,
  RedactionRule,
} from "./types/capability";

export type ConnectorFieldErrors = Record<string, ConnectorFieldError>;
export type ConnectorFormValues = Record<string, string>;

/**
 * Hostnames a self-hosted `hostOverride` may never resolve to.
 *
 * Host overrides exist so a customer can point a connector at their own
 * GitLab or Qdrant. The same field would otherwise let anyone aim the
 * server-side proxy at the cloud metadata endpoint or at loopback, turning a
 * connector form into an SSRF primitive. The check runs on both sides: here
 * for immediate feedback, and again in the edge function, which is the one
 * that matters.
 */
const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/i,
  /^169\.254\./, // link-local, including 169.254.169.254
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /\.internal$/i,
  /\.local$/i,
  /^metadata(\.|$)/i,
];

/**
 * `localhost` is legitimate for a provider meant to run beside the workload
 * (Ollama on the agent-server host), so the block list is opt-out per
 * manifest rather than absolute.
 */
const LOOPBACK_ALLOWED_PROVIDERS = new Set([
  "ollama",
  "litellm",
  "qdrant",
  "postgres",
]);

/**
 * IPv6 ranges with the same "reach the host/orchestrator, not the customer's
 * service" problem as their IPv4 counterparts above.
 */
const BLOCKED_IPV6_PATTERNS: RegExp[] = [
  /^::1$/, // loopback
  /^::$/, // unspecified
  /^fe[89ab][0-9a-f]:/i, // link-local, fe80::/10
  /^f[cd][0-9a-f]{2}:/i, // unique-local, fc00::/7
];

/**
 * Strips a scheme, path and port down to the bare host, the way the two
 * `isBlockedHost` callers below already expect -- except a bracketed IPv6
 * literal (`[::1]`, `[::1]:8080`) has colons that are part of the address,
 * not a port separator. Blindly taking everything before the first `:` (the
 * previous implementation) left `bare` as a lone `"["` for any such host,
 * which no blocklist pattern could ever match.
 */
function normalizeHostForBlockCheck(host: string): string {
  const stripped = host
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0];
  const bracketed = stripped.match(/^\[(.+)\](?::\d{1,5})?$/);
  if (bracketed) return bracketed[1];
  // An unbracketed literal IPv6 address has more than one colon; there is no
  // port to strip, and doing so would mangle the address the same way.
  if ((stripped.match(/:/g) ?? []).length > 1) return stripped;
  return stripped.split(":")[0];
}

export function isBlockedHost(host: string, providerId?: string): boolean {
  const bare = normalizeHostForBlockCheck(host);
  if (!bare) return false;
  if (providerId && LOOPBACK_ALLOWED_PROVIDERS.has(providerId)) return false;
  if (BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(bare))) return true;
  if (!bare.includes(":")) return false;
  if (BLOCKED_IPV6_PATTERNS.some((pattern) => pattern.test(bare))) return true;
  // An IPv4-mapped IPv6 address (`::ffff:169.254.169.254`) embeds the exact
  // address the IPv4 patterns above already block -- check that tail too.
  const mapped = bare.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)?.[1];
  return Boolean(
    mapped && BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(mapped)),
  );
}

export function isFieldRequired(
  field: ConnectorField,
  values: ConnectorFormValues,
): boolean {
  if (typeof field.required === "boolean") return field.required;
  const [name, expected] = field.required.whenFieldEquals;
  return values[name] === expected;
}

function looksLikeHost(value: string): boolean {
  const bare = value
    .trim()
    .replace(/^https?:\/\//, "")
    .split("/")[0];
  if (!bare) return false;
  // host[:port], at least one dot or a bare hostname like `localhost`.
  return /^[a-z0-9._-]+(:\d{1,5})?$/i.test(bare);
}

export function getInitialFormValues(
  manifest: ConnectorManifest,
): ConnectorFormValues {
  const values: ConnectorFormValues = {};
  for (const field of manifest.fields) {
    values[field.name] =
      field.defaultValue === undefined ? "" : String(field.defaultValue);
  }
  return values;
}

export interface SplitConnectorValues {
  /** Plaintext configuration: hosts, regions, buckets -- never a secret. */
  config: Record<string, string>;
  /** Secret fields, destined for the Edge Function and nowhere else. */
  credentials: ConnectorFormValues;
}

/**
 * Splits what a form collected into the two payloads every connection call
 * takes. Blank values are dropped rather than sent as empty strings, so an
 * optional field left untouched does not overwrite a stored one with "".
 */
export function splitConnectorValues(
  manifest: ConnectorManifest,
  values: ConnectorFormValues,
): SplitConnectorValues {
  const config: Record<string, string> = {};
  const credentials: ConnectorFormValues = {};
  for (const field of manifest.fields) {
    const value = values[field.name];
    if (!value) continue;
    if (field.secret) credentials[field.name] = value;
    else config[field.name] = value;
  }
  return { config, credentials };
}

/**
 * Pure, synchronous validation shared by the connection form, the credential
 * sheet and the edge function. Returns codes, never sentences -- the message
 * is an i18n lookup at render time.
 */
export function validateConnectorValues(
  manifest: ConnectorManifest,
  values: ConnectorFormValues,
): ConnectorFieldErrors {
  const errors: ConnectorFieldErrors = {};

  for (const field of manifest.fields) {
    const raw = values[field.name] ?? "";
    const value = raw.trim();

    if (!value) {
      if (isFieldRequired(field, values))
        errors[field.name] = { code: "required" };
      continue;
    }

    if (field.minLength !== undefined && value.length < field.minLength) {
      errors[field.name] = { code: "minLength", length: field.minLength };
      continue;
    }
    if (field.maxLength !== undefined && value.length > field.maxLength) {
      errors[field.name] = { code: "maxLength", length: field.maxLength };
      continue;
    }

    if (field.kind === "select" && field.options) {
      if (!field.options.some((option) => option.value === value)) {
        errors[field.name] = { code: "invalidOption" };
        continue;
      }
    }

    if (field.kind === "host") {
      if (!looksLikeHost(value)) {
        errors[field.name] = { code: "notAHost" };
        continue;
      }
      if (isBlockedHost(value, manifest.id)) {
        errors[field.name] = { code: "blockedHost" };
        continue;
      }
    }

    if (field.kind === "url") {
      let parsed: URL | null = null;
      try {
        parsed = new URL(value);
      } catch {
        parsed = null;
      }
      if (!parsed) {
        errors[field.name] = { code: "notAHost" };
        continue;
      }
      if (parsed.protocol !== "https:") {
        errors[field.name] = { code: "notHttps" };
        continue;
      }
      if (isBlockedHost(parsed.hostname, manifest.id)) {
        errors[field.name] = { code: "blockedHost" };
        continue;
      }
    }

    if (field.kind === "json") {
      try {
        JSON.parse(value);
      } catch {
        errors[field.name] = { code: "invalidJson" };
        continue;
      }
    }

    if (field.pattern) {
      let matches = true;
      try {
        matches = new RegExp(field.pattern).test(value);
      } catch {
        // A malformed pattern in a manifest must not block a valid value; the
        // registry integrity test is what catches the bad pattern.
        matches = true;
      }
      if (!matches) {
        errors[field.name] = {
          code: "pattern",
          hintKey: field.patternHintKey ?? "CONNECTOR$FIELD_PATTERN_GENERIC",
        };
      }
    }
  }

  return errors;
}

export function hasFieldErrors(errors: ConnectorFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * Masks a value for display and for the agent-facing receipt. `full` is the
 * default for anything not explicitly marked, so a manifest author forgetting
 * the `redact` field fails closed.
 */
export function redactValue(
  value: string,
  rule: RedactionRule | undefined,
): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  switch (rule) {
    case "last4":
      return trimmed.length <= 4
        ? "•".repeat(trimmed.length)
        : `${"•".repeat(4)}${trimmed.slice(-4)}`;
    case "domain-only": {
      const at = trimmed.lastIndexOf("@");
      return at >= 0
        ? `${"•".repeat(4)}@${trimmed.slice(at + 1)}`
        : "•".repeat(8);
    }
    case "full":
    default:
      return "•".repeat(8);
  }
}

/** Builds the masked summary stored alongside a connection. */
export function buildRedactedSummary(
  manifest: ConnectorManifest,
  values: ConnectorFormValues,
): Record<string, string> {
  const summary: Record<string, string> = {};
  for (const field of manifest.fields) {
    const value = values[field.name];
    if (!value) continue;
    summary[field.name] = field.secret
      ? redactValue(value, field.redact)
      : value;
  }
  return summary;
}
