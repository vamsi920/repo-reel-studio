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

export function isBlockedHost(host: string, providerId?: string): boolean {
  const bare = host
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split(":")[0];
  if (!bare) return false;
  if (providerId && LOOPBACK_ALLOWED_PROVIDERS.has(providerId)) return false;
  return BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(bare));
}

function isFieldRequired(
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
