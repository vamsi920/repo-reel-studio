import type { PromptFeatures } from "./features";
import type { RoutingPolicy, RoutingTier } from "./types";

/**
 * RouteLLM-style complexity scoring: a weighted linear score in 0..1 compared
 * against a policy threshold. Deterministic and explainable; the optional
 * classifier only weighs in when the score lands inside the ambiguity band.
 */
// @spec MR-004 — Complexity scorer and policy thresholds
export const FRONTIER_THRESHOLD: Record<RoutingPolicy, number> = {
  quality: 0.35,
  balanced: 0.55,
  economy: 0.75,
};

/** Gap between the light/standard and standard/frontier thresholds. */
const STANDARD_BAND = 0.25;
export const AMBIGUITY_BAND = 0.08;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function scoreComplexity(f: PromptFeatures): number {
  if (f.isTrivial) return 0.02;
  const score =
    0.3 +
    Math.min(f.estTokens / 1500, 1) * 0.2 +
    Math.min(f.codeBlocks, 3) * 0.06 +
    (f.hasStackTrace ? 0.12 : 0) +
    Math.min(f.filePathCount, 5) * 0.03 +
    Math.min(f.listItems, 8) * 0.02 +
    Math.min(f.heavyHits, 4) * 0.09 -
    Math.min(f.lightHits, 3) * 0.08;
  return Math.round(clamp01(score) * 1000) / 1000;
}

export function tierForScore(
  score: number,
  policy: RoutingPolicy,
): RoutingTier {
  const frontier = FRONTIER_THRESHOLD[policy];
  if (score >= frontier) return "frontier";
  if (score >= frontier - STANDARD_BAND) return "standard";
  return "light";
}

/** Distance from the nearest tier boundary, normalised to 0..1. */
export function scoreConfidence(score: number, policy: RoutingPolicy): number {
  const frontier = FRONTIER_THRESHOLD[policy];
  const boundaries = [frontier, frontier - STANDARD_BAND];
  const distance = Math.min(...boundaries.map((b) => Math.abs(score - b)));
  return Math.round(clamp01(distance / 0.25) * 100) / 100;
}

export function isAmbiguous(score: number, policy: RoutingPolicy): boolean {
  const frontier = FRONTIER_THRESHOLD[policy];
  return (
    Math.abs(score - frontier) < AMBIGUITY_BAND ||
    Math.abs(score - (frontier - STANDARD_BAND)) < AMBIGUITY_BAND
  );
}

/** How far past the threshold a downgrade verdict sits (for hysteresis). */
export function downgradeMargin(
  score: number,
  policy: RoutingPolicy,
  target: RoutingTier,
): number {
  const frontier = FRONTIER_THRESHOLD[policy];
  const ceiling = target === "light" ? frontier - STANDARD_BAND : frontier;
  return ceiling - score;
}
