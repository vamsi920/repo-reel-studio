/**
 * Measured savings, not marketing numbers.
 *
 * Every context build records what it actually did: how many tokens of memory
 * existed, how many survived selection, how many survived compression, and how
 * many came back from cache instead of being rebuilt. Cost is derived from
 * those counts and published pricing, and is simply absent when the model's
 * pricing is unknown.
 *
 * "Avoided" here means exactly one thing: tokens that were dropped by
 * selection or compression between the raw candidate set and the block that
 * was actually sent. It is not a claim about what a different system would
 * have spent.
 */
import { lookupModelPricing, type ModelPricing } from "./model-pricing";

export interface SavingsSample {
  workspaceId: string;
  conversationId: string | null;
  at: string;
  /** Total tokens of all memory records considered. */
  candidateRawTokens: number;
  selectedTokensBeforeCompression: number;
  finalContextTokens: number;
  /** Non-zero only on a cache hit, where the block was reused verbatim. */
  cachedTokensReused: number;
  compressionRatio: number;
  model: string | null;
  fromCache: boolean;
}

export interface SavingsCost {
  /** Input cost of the context actually sent. */
  costWithOptimization: number | null;
  /** Input cost had the full candidate set been sent uncompressed. */
  costWithoutOptimization: number | null;
  estimatedCostAvoided: number | null;
}

export interface SavingsSummary {
  samples: number;
  tokensUsed: number;
  tokensAvoided: number;
  cachedTokensReused: number;
  cacheHitRate: number;
  averageCompressionRatio: number;
  retrievalCount: number;
  costWithOptimization: number | null;
  costWithoutOptimization: number | null;
  estimatedCostAvoided: number | null;
  /** True when at least one sample used a model with no published pricing. */
  hasUnpricedSamples: boolean;
}

export function tokensAvoided(sample: SavingsSample): number {
  return Math.max(0, sample.candidateRawTokens - sample.finalContextTokens);
}

export function estimateCostUsd(
  sample: SavingsSample,
  pricing: ModelPricing | null = lookupModelPricing(sample.model),
): SavingsCost {
  if (!pricing) {
    return {
      costWithOptimization: null,
      costWithoutOptimization: null,
      estimatedCostAvoided: null,
    };
  }

  const perToken = pricing.inputPerMTok / 1_000_000;
  // Cached context is re-sent, but at the cache-read rate rather than full price.
  const billedTokens = sample.fromCache
    ? sample.finalContextTokens *
      (pricing.cacheReadPerMTok / pricing.inputPerMTok)
    : sample.finalContextTokens;

  const costWithOptimization = billedTokens * perToken;
  const costWithoutOptimization = sample.candidateRawTokens * perToken;

  return {
    costWithOptimization,
    costWithoutOptimization,
    estimatedCostAvoided: Math.max(
      0,
      costWithoutOptimization - costWithOptimization,
    ),
  };
}

export function aggregateSavings(
  samples: readonly SavingsSample[],
): SavingsSummary {
  const empty: SavingsSummary = {
    samples: 0,
    tokensUsed: 0,
    tokensAvoided: 0,
    cachedTokensReused: 0,
    cacheHitRate: 0,
    averageCompressionRatio: 0,
    retrievalCount: 0,
    costWithOptimization: null,
    costWithoutOptimization: null,
    estimatedCostAvoided: null,
    hasUnpricedSamples: false,
  };
  if (samples.length === 0) return empty;

  let costWith = 0;
  let costWithout = 0;
  let pricedSamples = 0;
  let hasUnpricedSamples = false;

  const totals = samples.reduce(
    (acc, sample) => {
      const cost = estimateCostUsd(sample);
      if (cost.costWithOptimization === null) {
        hasUnpricedSamples = true;
      } else {
        costWith += cost.costWithOptimization;
        costWithout += cost.costWithoutOptimization ?? 0;
        pricedSamples += 1;
      }
      return {
        tokensUsed: acc.tokensUsed + sample.finalContextTokens,
        tokensAvoided: acc.tokensAvoided + tokensAvoided(sample),
        cachedTokensReused: acc.cachedTokensReused + sample.cachedTokensReused,
        cacheHits: acc.cacheHits + (sample.fromCache ? 1 : 0),
        compressionRatioSum: acc.compressionRatioSum + sample.compressionRatio,
      };
    },
    {
      tokensUsed: 0,
      tokensAvoided: 0,
      cachedTokensReused: 0,
      cacheHits: 0,
      compressionRatioSum: 0,
    },
  );

  return {
    samples: samples.length,
    tokensUsed: totals.tokensUsed,
    tokensAvoided: totals.tokensAvoided,
    cachedTokensReused: totals.cachedTokensReused,
    cacheHitRate: totals.cacheHits / samples.length,
    averageCompressionRatio: totals.compressionRatioSum / samples.length,
    retrievalCount: samples.length,
    costWithOptimization: pricedSamples > 0 ? costWith : null,
    costWithoutOptimization: pricedSamples > 0 ? costWithout : null,
    estimatedCostAvoided:
      pricedSamples > 0 ? Math.max(0, costWithout - costWith) : null,
    hasUnpricedSamples,
  };
}

/**
 * Filters to a calendar month for the monthly rollup. Samples are stamped in
 * UTC, so the bucketing is UTC too -- otherwise the same sample lands in
 * different months depending on where the browser is.
 */
export function filterSamplesForMonth(
  samples: readonly SavingsSample[],
  year: number,
  /** Zero-based, matching `Date.getUTCMonth`. */
  month: number,
): SavingsSample[] {
  return samples.filter((sample) => {
    const at = new Date(sample.at);
    return at.getUTCFullYear() === year && at.getUTCMonth() === month;
  });
}
