/**
 * Per-profile circuit breaker plus latency tracking. Pure reducers — the
 * routing store persists the results.
 *
 * - Rate limits open the circuit immediately (provider told us to back off).
 * - Outages/timeouts open it after a few consecutive failures.
 * - Auth failures mark the profile misconfigured until it is saved again.
 * - After the cooldown the circuit is half-open: one success closes it.
 */
// @spec MR-005 — Profile health circuit breaker
export type CircuitState = "closed" | "open" | "half_open";

export type LlmErrorKind =
  | "rate_limit"
  | "unavailable"
  | "timeout"
  | "auth"
  | "context_window"
  | "bad_request";

export interface ProfileHealth {
  state: CircuitState;
  consecutiveFailures: number;
  openedUntil: number | null;
  cooldownMs: number;
  misconfigured: boolean;
  latencyEmaMs: number | null;
  successes: number;
  failures: number;
  lastErrorKind: LlmErrorKind | null;
  lastChangedAt: number;
}

export type HealthMap = Record<string, ProfileHealth>;

export const RATE_LIMIT_COOLDOWN_MS = 60_000;
export const OUTAGE_COOLDOWN_MS = 30_000;
export const MAX_COOLDOWN_MS = 10 * 60_000;
export const OUTAGE_FAILURE_THRESHOLD = 3;
const LATENCY_ALPHA = 0.3;

export const freshHealth = (now = Date.now()): ProfileHealth => ({
  state: "closed",
  consecutiveFailures: 0,
  openedUntil: null,
  cooldownMs: 0,
  misconfigured: false,
  latencyEmaMs: null,
  successes: 0,
  failures: 0,
  lastErrorKind: null,
  lastChangedAt: now,
});

export function effectiveState(
  health: ProfileHealth | undefined,
  now: number,
): CircuitState {
  if (!health) return "closed";
  if (
    health.state === "open" &&
    health.openedUntil !== null &&
    now >= health.openedUntil
  ) {
    return "half_open";
  }
  return health.state;
}

export function isAvailable(
  health: ProfileHealth | undefined,
  now: number,
): boolean {
  if (!health) return true;
  if (health.misconfigured) return false;
  return effectiveState(health, now) !== "open";
}

export function recordFailure(
  prev: ProfileHealth | undefined,
  kind: LlmErrorKind,
  now: number,
  retryAfterMs?: number | null,
): ProfileHealth {
  const base = prev ?? freshHealth(now);
  const consecutiveFailures = base.consecutiveFailures + 1;
  const next: ProfileHealth = {
    ...base,
    consecutiveFailures,
    failures: base.failures + 1,
    lastErrorKind: kind,
    lastChangedAt: now,
  };

  if (kind === "auth") {
    return { ...next, misconfigured: true, state: "open", openedUntil: null };
  }
  // A context-window overflow or a malformed request says nothing about the
  // provider's health.
  if (kind === "context_window" || kind === "bad_request") return next;

  const wasHalfOpen = effectiveState(base, now) === "half_open";
  const shouldOpen =
    kind === "rate_limit" ||
    wasHalfOpen ||
    consecutiveFailures >= OUTAGE_FAILURE_THRESHOLD;
  if (!shouldOpen) return next;

  const baseCooldown =
    kind === "rate_limit" ? RATE_LIMIT_COOLDOWN_MS : OUTAGE_COOLDOWN_MS;
  const cooldownMs =
    retryAfterMs && retryAfterMs > 0
      ? Math.min(retryAfterMs, MAX_COOLDOWN_MS)
      : Math.min(
          base.cooldownMs > 0 ? base.cooldownMs * 2 : baseCooldown,
          MAX_COOLDOWN_MS,
        );
  return { ...next, state: "open", cooldownMs, openedUntil: now + cooldownMs };
}

export function recordSuccess(
  prev: ProfileHealth | undefined,
  now: number,
  latencyMs?: number | null,
): ProfileHealth {
  const base = prev ?? freshHealth(now);
  const latencyEmaMs =
    typeof latencyMs === "number" && latencyMs >= 0
      ? base.latencyEmaMs === null
        ? latencyMs
        : Math.round(
            LATENCY_ALPHA * latencyMs + (1 - LATENCY_ALPHA) * base.latencyEmaMs,
          )
      : base.latencyEmaMs;
  return {
    ...base,
    state: "closed",
    consecutiveFailures: 0,
    openedUntil: null,
    cooldownMs: 0,
    successes: base.successes + 1,
    latencyEmaMs,
    lastChangedAt: now,
  };
}

/** Lower is healthier; used as a ranking key. */
export function healthRank(
  health: ProfileHealth | undefined,
  now: number,
): number {
  const state = effectiveState(health, now);
  if (state === "closed") return 0;
  if (state === "half_open") return 1;
  return 2;
}
