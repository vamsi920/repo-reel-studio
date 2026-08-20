import { describe, expect, it } from "vitest";

import { lookupModelPricing } from "./model-pricing";
import {
  aggregateSavings,
  estimateCostUsd,
  filterSamplesForMonth,
  tokensAvoided,
  type SavingsSample,
} from "./savings";

function sample(overrides: Partial<SavingsSample> = {}): SavingsSample {
  return {
    workspaceId: "ws_test",
    conversationId: "conv-1",
    at: "2026-03-01T00:00:00.000Z",
    candidateRawTokens: 10_000,
    selectedTokensBeforeCompression: 2_000,
    finalContextTokens: 1_600,
    cachedTokensReused: 0,
    compressionRatio: 0.2,
    model: "claude-sonnet-4-5",
    fromCache: false,
    ...overrides,
  };
}

describe("estimateCostUsd", () => {
  it("prices a sample from the published input rate", () => {
    const pricing = lookupModelPricing("claude-sonnet-4-5")!;
    const cost = estimateCostUsd(sample());

    expect(cost.costWithOptimization).toBeCloseTo(
      (1_600 * pricing.inputPerMTok) / 1_000_000,
      10,
    );
    expect(cost.costWithoutOptimization).toBeCloseTo(
      (10_000 * pricing.inputPerMTok) / 1_000_000,
      10,
    );
    expect(cost.estimatedCostAvoided).toBeGreaterThan(0);
  });

  it("charges cached context at the cache-read rate", () => {
    const plain = estimateCostUsd(sample());
    const cached = estimateCostUsd(sample({ fromCache: true }));
    expect(cached.costWithOptimization!).toBeLessThan(
      plain.costWithOptimization!,
    );
  });

  it("returns null rather than a guess for an unpriced model", () => {
    const cost = estimateCostUsd(sample({ model: "some-internal-model-v9" }));
    expect(cost.costWithOptimization).toBeNull();
    expect(cost.costWithoutOptimization).toBeNull();
    expect(cost.estimatedCostAvoided).toBeNull();
  });

  it("returns null for a missing model rather than NaN", () => {
    const cost = estimateCostUsd(sample({ model: null }));
    expect(cost.estimatedCostAvoided).toBeNull();
    expect(Number.isNaN(cost.estimatedCostAvoided as unknown as number)).toBe(
      false,
    );
  });

  it("matches a model id carrying a provider prefix and a date suffix", () => {
    expect(
      lookupModelPricing("anthropic/claude-sonnet-4-5-20250929"),
    ).not.toBeNull();
  });
});

describe("tokensAvoided", () => {
  it("is the gap between the raw candidate set and what was sent", () => {
    expect(tokensAvoided(sample())).toBe(8_400);
  });

  it("never goes negative", () => {
    expect(
      tokensAvoided(
        sample({ candidateRawTokens: 100, finalContextTokens: 500 }),
      ),
    ).toBe(0);
  });
});

describe("aggregateSavings", () => {
  it("reports zeros and null costs for an empty set", () => {
    const summary = aggregateSavings([]);
    expect(summary.samples).toBe(0);
    expect(summary.estimatedCostAvoided).toBeNull();
    expect(summary.cacheHitRate).toBe(0);
  });

  it("rolls up tokens, cache hit rate and compression", () => {
    const summary = aggregateSavings([
      sample(),
      sample({
        fromCache: true,
        cachedTokensReused: 1_600,
        compressionRatio: 0.3,
      }),
    ]);

    expect(summary.samples).toBe(2);
    expect(summary.retrievalCount).toBe(2);
    expect(summary.tokensUsed).toBe(3_200);
    expect(summary.tokensAvoided).toBe(16_800);
    expect(summary.cachedTokensReused).toBe(1_600);
    expect(summary.cacheHitRate).toBe(0.5);
    expect(summary.averageCompressionRatio).toBeCloseTo(0.25, 10);
    expect(summary.estimatedCostAvoided).toBeGreaterThan(0);
    expect(summary.hasUnpricedSamples).toBe(false);
  });

  it("flags unpriced samples instead of dropping them silently", () => {
    const summary = aggregateSavings([
      sample(),
      sample({ model: "some-internal-model-v9" }),
    ]);
    expect(summary.hasUnpricedSamples).toBe(true);
    // Token counts still include the unpriced sample.
    expect(summary.tokensUsed).toBe(3_200);
    // Costs cover only the priced one.
    expect(summary.costWithOptimization).toBeGreaterThan(0);
  });

  it("reports null costs when nothing in the set is priced", () => {
    const summary = aggregateSavings([sample({ model: null })]);
    expect(summary.costWithOptimization).toBeNull();
    expect(summary.estimatedCostAvoided).toBeNull();
    expect(summary.hasUnpricedSamples).toBe(true);
  });
});

describe("filterSamplesForMonth", () => {
  it("keeps only the requested calendar month", () => {
    const samples = [
      sample({ at: "2026-03-15T00:00:00.000Z" }),
      sample({ at: "2026-04-01T00:00:00.000Z" }),
    ];
    // Month is zero-based, matching Date.getUTCMonth.
    expect(filterSamplesForMonth(samples, 2026, 2)).toHaveLength(1);
  });
});
