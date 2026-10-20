import { isAvailable, type HealthMap, type LlmErrorKind } from "./health";
import { TIER_RANK, type RouteCandidate, type RouteReasonCode } from "./types";

/**
 * Turns an agent-server LLM error into a routing action. Codes come from the
 * SDK's litellm-backed `LLMError` subclasses (see `src/utils/acp-error-codes.ts`);
 * the detail regexes catch servers/providers that only describe the failure.
 */
// @spec MR-008 — LLM error classification and fallback
const CODE_TO_KIND: Record<string, LlmErrorKind> = {
  LLMRateLimitError: "rate_limit",
  LLMServiceUnavailableError: "unavailable",
  LLMTimeoutError: "timeout",
  LLMAuthenticationError: "auth",
  LLMBadRequestError: "bad_request",
  LLMContextWindowExceedError: "context_window",
};

export const MAX_FALLBACK_HOPS = 2;

export function classifyLlmError(
  code: string | null | undefined,
  detail: string | null | undefined,
): LlmErrorKind | null {
  if (code && CODE_TO_KIND[code]) return CODE_TO_KIND[code];
  const text = detail ?? "";
  if (!text) return null;
  if (/RESOURCE_EXHAUSTED|RateLimitError|rate.?limit|quota|\b429\b/i.test(text))
    return "rate_limit";
  if (/context.?window|maximum context length|too many tokens/i.test(text))
    return "context_window";
  if (
    /AuthenticationError|invalid api key|api key not valid|\b401\b/i.test(text)
  )
    return "auth";
  if (/timed? ?out|Timeout/i.test(text)) return "timeout";
  if (
    /ServiceUnavailable|\b50[234]\b|overloaded|InternalServerError|APIConnectionError/i.test(
      text,
    )
  )
    return "unavailable";
  return null;
}

export function isRetryableKind(kind: LlmErrorKind | null): boolean {
  return (
    kind === "rate_limit" ||
    kind === "unavailable" ||
    kind === "timeout" ||
    kind === "context_window"
  );
}

export const FALLBACK_REASON: Record<
  "rate_limit" | "unavailable" | "timeout" | "context_window",
  RouteReasonCode
> = {
  rate_limit: "fallback_rate_limit",
  unavailable: "fallback_unavailable",
  timeout: "fallback_timeout",
  context_window: "fallback_context_window",
};

/** `retry-after: 30`, `"retryDelay": "30s"`, `retry in 12.5s` → ms. */
export function parseRetryAfterMs(
  detail: string | null | undefined,
): number | null {
  if (!detail) return null;
  const match =
    detail.match(
      /retry[-_ ]?after["':\s]*(\d+(?:\.\d+)?)\s*(ms|s|sec|seconds)?/i,
    ) ??
    detail.match(/retryDelay["':\s]*"?(\d+(?:\.\d+)?)(ms|s)"?/i) ??
    detail.match(/retry in (\d+(?:\.\d+)?)\s*(ms|s|sec|seconds)/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return match[2]?.toLowerCase() === "ms" ? value : Math.round(value * 1000);
}

/**
 * Next profile to try after `current` failed. Same tier first, then stronger,
 * then weaker; a context overflow only considers larger windows.
 */
export function nextFallback(args: {
  current: RouteCandidate | null;
  kind: LlmErrorKind;
  candidates: RouteCandidate[];
  health: HealthMap;
  tried: string[];
  now: number;
}): RouteCandidate | null {
  const { current, kind, candidates, health, tried, now } = args;
  const pool = candidates.filter(
    (c) =>
      c.profileName !== current?.profileName &&
      !tried.includes(c.profileName) &&
      isAvailable(health[c.profileName], now),
  );
  if (pool.length === 0) return null;

  if (kind === "context_window") {
    const minWindow = current?.contextWindow ?? 0;
    return (
      pool
        .filter((c) => c.contextWindow > minWindow)
        .sort((a, b) => b.contextWindow - a.contextWindow)[0] ?? null
    );
  }

  const currentRank = current ? TIER_RANK[current.tier] : TIER_RANK.standard;
  const order = (c: RouteCandidate) => {
    const diff = TIER_RANK[c.tier] - currentRank;
    if (diff === 0) return 0;
    return diff > 0 ? diff : 10 - diff;
  };
  return (
    [...pool].sort(
      (a, b) =>
        order(a) - order(b) ||
        (a.costPerMTok ?? Number.MAX_SAFE_INTEGER) -
          (b.costPerMTok ?? Number.MAX_SAFE_INTEGER),
    )[0] ?? null
  );
}
