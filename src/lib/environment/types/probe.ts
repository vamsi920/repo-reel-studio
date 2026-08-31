import type { Capability } from "./capability";

/**
 * Where a check was executed from. This is not decoration -- it is the whole
 * point.
 *
 * - `browser`  the user's machine, limited to what CORS allows.
 * - `edge`     a Supabase Edge Function. Reports SUPABASE's connectivity, not
 *              the customer's. An egress check from here is evidence about a
 *              datacentre in another country.
 * - `runtime`  the host actually running the agent-server / automation
 *              service. The only vantage that answers "can my workload reach
 *              github.com through my proxy".
 *
 * A `ProbeResult` without its vantage is a claim without a source, so the
 * field is required and the UI always labels it.
 */
export type ProbeVantage = "browser" | "edge" | "runtime";

export type ProbeKind =
  | "connection"
  | "egress"
  | "pg-extensions"
  | "backend-key"
  | "webhook-ingress"
  | "clock-skew"
  | "host-prereqs"
  | "deployment-defects";

export interface ProbeCheck {
  id: string;
  ok: boolean;
  labelKey: string;
  /** Machine-readable, already redacted at the source. Never a secret. */
  detail?: string;
  observed?: string | number;
  expected?: string | number;
}

export interface RemediationStep {
  kind: "env" | "network" | "sql" | "console" | "cli";
  targetKey: string;
  /** Literal value to apply, when there is one (a host, a SQL statement). */
  value?: string;
  docsUrl?: string;
}

export interface Remediation {
  codeKey: string;
  steps: RemediationStep[];
  /**
   * Whether the onboarding agent is permitted to attempt this itself. False
   * for anything that needs a human decision, a credential, or a change
   * outside the app (firewall rules, IdP configuration).
   */
  agentActionable: boolean;
}

export interface ProbeResult {
  ok: boolean;
  vantage: ProbeVantage;
  latencyMs: number;
  checks: ProbeCheck[];
  remediation?: Remediation;
  /** Connection probes only. */
  grantedScopes?: string[];
  missingScopes?: string[];
  serverVersion?: string;
  /** Remote `Date` header minus local clock. Positive means remote is ahead. */
  clockSkewMs?: number;
  probedAt: string;
}

/**
 * A connection's state after a write. Structurally incapable of carrying a
 * secret: there is no field a plaintext credential could occupy. This is the
 * only shape that ever goes back into an agent transcript.
 */
export interface ConnectionReceipt {
  connectionId: string;
  capability: Capability;
  providerId: string;
  instanceKey: string;
  status: ConnectionStatus;
  /** `sha256:` prefix plus the first bytes -- rotation and drift detection. */
  fingerprint: string;
  /** Field name -> masked display value, computed edge-side. */
  redacted: Record<string, string>;
  grantedScopes: string[];
  missingScopes: string[];
  probe?: ProbeResult;
}

export type ConnectionStatus =
  | "unverified"
  | "ok"
  | "degraded"
  | "error"
  | "expired"
  | "revoked";

/**
 * Named error codes with predicates, following the convention established by
 * `INVALID_BACKEND_API_KEY_ERROR` in `src/hooks/query/use-backends-health.ts`.
 * Callers branch on a predicate, never on a message substring.
 */
export const PROBE_UNREACHABLE_ERROR = "PROBE_UNREACHABLE" as const;
export const PROBE_UNAUTHORIZED_ERROR = "PROBE_UNAUTHORIZED" as const;
export const PROBE_FORBIDDEN_ERROR = "PROBE_FORBIDDEN" as const;
export const PROBE_TIMEOUT_ERROR = "PROBE_TIMEOUT" as const;
export const PROBE_TLS_ERROR = "PROBE_TLS" as const;
export const PROBE_RATE_LIMITED_ERROR = "PROBE_RATE_LIMITED" as const;
export const PROBE_SCOPE_DOWNGRADE_ERROR = "PROBE_SCOPE_DOWNGRADE" as const;
export const PROBE_CLOCK_SKEW_ERROR = "PROBE_CLOCK_SKEW" as const;
export const PROBE_NOT_CONFIGURED_ERROR = "PROBE_NOT_CONFIGURED" as const;

export type ProbeErrorCode =
  | typeof PROBE_UNREACHABLE_ERROR
  | typeof PROBE_UNAUTHORIZED_ERROR
  | typeof PROBE_FORBIDDEN_ERROR
  | typeof PROBE_TIMEOUT_ERROR
  | typeof PROBE_TLS_ERROR
  | typeof PROBE_RATE_LIMITED_ERROR
  | typeof PROBE_SCOPE_DOWNGRADE_ERROR
  | typeof PROBE_CLOCK_SKEW_ERROR
  | typeof PROBE_NOT_CONFIGURED_ERROR;

function hasCode(error: unknown, code: ProbeErrorCode): boolean {
  if (typeof error === "string") return error === code;
  if (error && typeof error === "object" && "code" in error) {
    return (error as { code?: unknown }).code === code;
  }
  return false;
}

export const isProbeUnreachableError = (error: unknown) =>
  hasCode(error, PROBE_UNREACHABLE_ERROR);
export const isProbeUnauthorizedError = (error: unknown) =>
  hasCode(error, PROBE_UNAUTHORIZED_ERROR);
export const isProbeForbiddenError = (error: unknown) =>
  hasCode(error, PROBE_FORBIDDEN_ERROR);
export const isProbeTimeoutError = (error: unknown) =>
  hasCode(error, PROBE_TIMEOUT_ERROR);
export const isProbeTlsError = (error: unknown) =>
  hasCode(error, PROBE_TLS_ERROR);
export const isProbeRateLimitedError = (error: unknown) =>
  hasCode(error, PROBE_RATE_LIMITED_ERROR);
export const isProbeScopeDowngradeError = (error: unknown) =>
  hasCode(error, PROBE_SCOPE_DOWNGRADE_ERROR);
export const isProbeClockSkewError = (error: unknown) =>
  hasCode(error, PROBE_CLOCK_SKEW_ERROR);
export const isProbeNotConfiguredError = (error: unknown) =>
  hasCode(error, PROBE_NOT_CONFIGURED_ERROR);

/** Beyond this, OAuth `iat`/`exp` and webhook HMAC windows start rejecting. */
export const MAX_TOLERABLE_CLOCK_SKEW_MS = 5 * 60 * 1000;
