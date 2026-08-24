import { describe, expect, it } from "vitest";

import { diffCost, diffUsageSnapshot } from "./diff-usage";
import type { LlmUsageSnapshot } from "./types";

function snapshot(overrides: Partial<LlmUsageSnapshot> = {}): LlmUsageSnapshot {
  return {
    promptTokens: 0,
    completionTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    ...overrides,
  };
}

describe("diffUsageSnapshot", () => {
  it("returns the full snapshot as the delta when there is no previous one", () => {
    const current = snapshot({ promptTokens: 100, completionTokens: 50 });
    expect(diffUsageSnapshot(undefined, current)).toEqual(current);
  });

  it("returns only the genuine increment between two snapshots", () => {
    const previous = snapshot({ promptTokens: 100, completionTokens: 50 });
    const current = snapshot({ promptTokens: 140, completionTokens: 50 });
    expect(diffUsageSnapshot(previous, current)).toEqual(
      snapshot({ promptTokens: 40, completionTokens: 0 }),
    );
  });

  it("returns null for a no-op update", () => {
    const same = snapshot({ promptTokens: 100 });
    expect(diffUsageSnapshot(same, same)).toBeNull();
  });

  it("clamps a decrease to zero rather than reporting negative usage", () => {
    const previous = snapshot({ promptTokens: 200 });
    const current = snapshot({ promptTokens: 100 });
    expect(diffUsageSnapshot(previous, current)).toBeNull();
  });

  it("diffs every field independently", () => {
    const previous = snapshot({
      promptTokens: 10,
      completionTokens: 10,
      cacheReadTokens: 10,
      cacheWriteTokens: 10,
    });
    const current = snapshot({
      promptTokens: 10,
      completionTokens: 10,
      cacheReadTokens: 25,
      cacheWriteTokens: 10,
    });
    expect(diffUsageSnapshot(previous, current)).toEqual(
      snapshot({ cacheReadTokens: 15 }),
    );
  });
});

describe("diffCost", () => {
  it("returns the increment when cost genuinely increased", () => {
    expect(diffCost(1.5, 2.25)).toBeCloseTo(0.75, 10);
  });

  it("returns null for no change", () => {
    expect(diffCost(1.5, 1.5)).toBeNull();
  });

  it("returns null for a decrease rather than a negative cost", () => {
    expect(diffCost(2, 1)).toBeNull();
  });

  it("treats a missing previous value as zero", () => {
    expect(diffCost(undefined, 0.5)).toBeCloseTo(0.5, 10);
  });

  it("returns null when the current value is null", () => {
    expect(diffCost(1, null)).toBeNull();
  });
});
