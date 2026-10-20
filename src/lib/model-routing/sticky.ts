import { TIER_RANK, type RoutingTier } from "./types";

/**
 * Hysteresis so Auto does not thrash between models. Switching models throws
 * away the provider's prompt cache, so:
 *   - upgrades apply immediately (never under-serve a hard turn);
 *   - downgrades need two consecutive lighter verdicts, a minimum dwell
 *     (turns or wall-clock) since the last switch, and a clear score margin;
 *   - capability-forced switches (vision, context fit) bypass all of this.
 */
// @spec MR-007 — Sticky routing / hysteresis
export interface StickyState {
  turnsSinceSwitch: number;
  lastSwitchAt: number;
  consecutiveLowerVerdicts: number;
}

export const DOWNGRADE_MIN_TURNS = 3;
export const DOWNGRADE_MIN_DWELL_MS = 5 * 60_000;
export const DOWNGRADE_REQUIRED_VERDICTS = 2;
export const DOWNGRADE_MIN_MARGIN = 0.15;

export const freshSticky = (now: number): StickyState => ({
  turnsSinceSwitch: 0,
  lastSwitchAt: now,
  consecutiveLowerVerdicts: 0,
});

export type StickyVerdict = "switch" | "hold";

export function evaluateSticky(args: {
  sticky: StickyState | undefined;
  currentTier: RoutingTier;
  chosenTier: RoutingTier;
  margin: number;
  now: number;
}): StickyVerdict {
  const { sticky, currentTier, chosenTier, margin, now } = args;
  const diff = TIER_RANK[chosenTier] - TIER_RANK[currentTier];
  if (diff > 0) return "switch";
  // Same tier: a different profile buys nothing worth a cold cache.
  if (diff === 0) return "hold";
  if (!sticky) return margin >= DOWNGRADE_MIN_MARGIN ? "switch" : "hold";

  const verdicts = sticky.consecutiveLowerVerdicts + 1;
  const dwelled =
    sticky.turnsSinceSwitch >= DOWNGRADE_MIN_TURNS ||
    now - sticky.lastSwitchAt >= DOWNGRADE_MIN_DWELL_MS;
  return verdicts >= DOWNGRADE_REQUIRED_VERDICTS &&
    dwelled &&
    margin >= DOWNGRADE_MIN_MARGIN
    ? "switch"
    : "hold";
}

/** Advance sticky bookkeeping after a turn is routed. */
export function nextStickyState(
  prev: StickyState | undefined,
  outcome: { switched: boolean; wantedLower: boolean },
  now: number,
): StickyState {
  if (outcome.switched) return freshSticky(now);
  const base = prev ?? freshSticky(now);
  return {
    ...base,
    turnsSinceSwitch: base.turnsSinceSwitch + 1,
    consecutiveLowerVerdicts: outcome.wantedLower
      ? base.consecutiveLowerVerdicts + 1
      : 0,
  };
}
