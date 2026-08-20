/**
 * Published per-million-token prices, used only to turn measured token counts
 * into a cost estimate.
 *
 * Prices move. An unknown or stale model must render as "unknown", never as a
 * confident number: a fabricated saving is worse than no saving shown at all.
 * Matching is longest-prefix so `anthropic/claude-opus-4-5-20251101` resolves
 * through `claude-opus-4-5`.
 */

export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok: number;
}

/**
 * Keyed by the model-id fragment that identifies a family. Keep entries sorted
 * longest-first at lookup time, not here.
 */
const PRICING_TABLE: Record<string, ModelPricing> = {
  "claude-opus-4-1": {
    inputPerMTok: 15,
    outputPerMTok: 75,
    cacheReadPerMTok: 1.5,
  },
  "claude-opus-4": {
    inputPerMTok: 15,
    outputPerMTok: 75,
    cacheReadPerMTok: 1.5,
  },
  "claude-sonnet-4-5": {
    inputPerMTok: 3,
    outputPerMTok: 15,
    cacheReadPerMTok: 0.3,
  },
  "claude-sonnet-4": {
    inputPerMTok: 3,
    outputPerMTok: 15,
    cacheReadPerMTok: 0.3,
  },
  "claude-3-7-sonnet": {
    inputPerMTok: 3,
    outputPerMTok: 15,
    cacheReadPerMTok: 0.3,
  },
  "claude-3-5-sonnet": {
    inputPerMTok: 3,
    outputPerMTok: 15,
    cacheReadPerMTok: 0.3,
  },
  "claude-haiku-4-5": {
    inputPerMTok: 1,
    outputPerMTok: 5,
    cacheReadPerMTok: 0.1,
  },
  "claude-3-5-haiku": {
    inputPerMTok: 0.8,
    outputPerMTok: 4,
    cacheReadPerMTok: 0.08,
  },
  "gpt-4o-mini": {
    inputPerMTok: 0.15,
    outputPerMTok: 0.6,
    cacheReadPerMTok: 0.075,
  },
  "gpt-4o": { inputPerMTok: 2.5, outputPerMTok: 10, cacheReadPerMTok: 1.25 },
  "gpt-4.1": { inputPerMTok: 2, outputPerMTok: 8, cacheReadPerMTok: 0.5 },
  o3: { inputPerMTok: 2, outputPerMTok: 8, cacheReadPerMTok: 0.5 },
  "gemini-2.5-pro": {
    inputPerMTok: 1.25,
    outputPerMTok: 10,
    cacheReadPerMTok: 0.31,
  },
  "gemini-2.5-flash": {
    inputPerMTok: 0.3,
    outputPerMTok: 2.5,
    cacheReadPerMTok: 0.075,
  },
};

/** Returns null for anything not in the table. Callers must render "unknown". */
export function lookupModelPricing(
  model: string | null | undefined,
): ModelPricing | null {
  if (!model) return null;
  const normalized = model.trim().toLowerCase();
  if (!normalized) return null;

  const match = Object.keys(PRICING_TABLE)
    .sort((a, b) => b.length - a.length)
    .find((key) => normalized.includes(key));

  return match ? PRICING_TABLE[match] : null;
}

export function isPricingKnown(model: string | null | undefined): boolean {
  return lookupModelPricing(model) !== null;
}
