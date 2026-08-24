import type { LlmUsageSnapshot } from "./types";

const ZERO_USAGE: LlmUsageSnapshot = {
  promptTokens: 0,
  completionTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

/**
 * `metrics-store`'s `usage` is cumulative for the current conversation, not a
 * per-turn delta -- recording the raw running total on every update would
 * wildly overcount once summed across many WS ticks. This turns two
 * cumulative snapshots into the genuine increment between them.
 *
 * Returns null when every field's delta is zero or negative (a no-op WS tick,
 * or a metrics reset producing a lower total than last seen -- clamped at
 * zero rather than recorded as negative usage).
 */
export function diffUsageSnapshot(
  previous: LlmUsageSnapshot | undefined,
  current: LlmUsageSnapshot,
): LlmUsageSnapshot | null {
  const base = previous ?? ZERO_USAGE;

  const delta: LlmUsageSnapshot = {
    promptTokens: Math.max(0, current.promptTokens - base.promptTokens),
    completionTokens: Math.max(
      0,
      current.completionTokens - base.completionTokens,
    ),
    cacheReadTokens: Math.max(
      0,
      current.cacheReadTokens - base.cacheReadTokens,
    ),
    cacheWriteTokens: Math.max(
      0,
      current.cacheWriteTokens - base.cacheWriteTokens,
    ),
  };

  const hasChange =
    delta.promptTokens > 0 ||
    delta.completionTokens > 0 ||
    delta.cacheReadTokens > 0 ||
    delta.cacheWriteTokens > 0;

  return hasChange ? delta : null;
}

/** Same clamp-at-zero treatment for the cumulative cost figure. */
export function diffCost(
  previous: number | null | undefined,
  current: number | null,
): number | null {
  if (current === null) return null;
  const base = previous ?? 0;
  const delta = current - base;
  return delta > 0 ? delta : null;
}
