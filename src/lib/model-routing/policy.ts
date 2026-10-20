import { healthRank, isAvailable, type HealthMap } from "./health";
import {
  TIER_RANK,
  type RouteCandidate,
  type RoutingPolicy,
  type RoutingTier,
} from "./types";

/**
 * Picks one candidate for a wanted tier. Ranking keys, in order:
 *   1. tier distance (exact match first; ties lean up for `quality`,
 *      down for `economy`/`balanced`)
 *   2. circuit health (closed > half-open)
 *   3. cost (cheapest first) — or context window (largest first) for quality
 *   4. observed latency (fastest first)
 */
// @spec MR-006 — Candidate selection policy
export function selectCandidate(
  wanted: RoutingTier,
  candidates: RouteCandidate[],
  policy: RoutingPolicy,
  health: HealthMap,
  now: number,
): RouteCandidate | null {
  if (candidates.length === 0) return null;
  const wantedRank = TIER_RANK[wanted];
  const leanUp = policy === "quality";

  const tierKey = (c: RouteCandidate) => {
    const diff = TIER_RANK[c.tier] - wantedRank;
    // Prefer the direction the policy leans when no exact tier exists.
    const directionPenalty = diff === 0 ? 0 : diff > 0 === leanUp ? 0 : 0.5;
    return Math.abs(diff) + directionPenalty;
  };
  const costKey = (c: RouteCandidate) =>
    leanUp ? -c.contextWindow : (c.costPerMTok ?? Number.MAX_SAFE_INTEGER);
  const latencyKey = (c: RouteCandidate) =>
    health[c.profileName]?.latencyEmaMs ?? Number.MAX_SAFE_INTEGER;

  return [...candidates].sort(
    (a, b) =>
      tierKey(a) - tierKey(b) ||
      healthRank(health[a.profileName], now) -
        healthRank(health[b.profileName], now) ||
      costKey(a) - costKey(b) ||
      latencyKey(a) - latencyKey(b) ||
      a.profileName.localeCompare(b.profileName),
  )[0];
}

/** Drop one tier as the conversation nears its budget. */
export function applyBudget(
  tier: RoutingTier,
  costUsd: number | undefined,
  budgetUsd: number | null,
): { tier: RoutingTier; downshift: "none" | "soft" | "exhausted" } {
  if (!budgetUsd || budgetUsd <= 0 || costUsd === undefined) {
    return { tier, downshift: "none" };
  }
  if (costUsd >= budgetUsd) return { tier: "light", downshift: "exhausted" };
  if (costUsd >= budgetUsd * 0.8 && tier !== "light") {
    return {
      tier: tier === "frontier" ? "standard" : "light",
      downshift: "soft",
    };
  }
  return { tier, downshift: "none" };
}

export function filterAvailable(
  candidates: RouteCandidate[],
  health: HealthMap,
  now: number,
): RouteCandidate[] {
  return candidates.filter((c) => isAvailable(health[c.profileName], now));
}
