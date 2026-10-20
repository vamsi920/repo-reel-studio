import { v4 as uuidv4 } from "uuid";
import { extractPromptFeatures } from "./features";
import { type HealthMap } from "./health";
import { applyBudget, filterAvailable, selectCandidate } from "./policy";
import {
  downgradeMargin,
  isAmbiguous,
  scoreComplexity,
  scoreConfidence,
  tierForScore,
} from "./scorer";
import { evaluateSticky, type StickyState } from "./sticky";
import type { RoutingClassifier } from "./classifier";
import {
  TIER_RANK,
  type DecisionSource,
  type RejectedCandidate,
  type RouteCandidate,
  type RouteReasonCode,
  type RouteRequest,
  type RouteTask,
  type RoutingDecision,
  type RoutingPolicy,
  type RoutingTier,
} from "./types";

/**
 * The hybrid router. `routeSync` is rules → capability gates → complexity
 * score → budget → policy selection → hysteresis, and never blocks. `route`
 * adds the classifier, consulted only for ambiguous scores.
 */
// @spec MR-010 — Hybrid router
export interface RoutingContext {
  candidates: RouteCandidate[];
  policy: RoutingPolicy;
  budgetUsd: number | null;
  excludedProfiles: string[];
  health: HealthMap;
  sticky?: StickyState;
  now: number;
}

export interface RouteOutcome {
  decision: RoutingDecision;
  /** Score landed in the ambiguity band and no hard rule decided. */
  needsClassifier: boolean;
  /** The wanted tier was below the current profile's tier. */
  wantedLower: boolean;
}

/** Fixed tiers for app-side tasks: they have no conversational signal. */
export const TASK_TIER_PRESET: Partial<Record<RouteTask, RoutingTier>> = {
  kt_generate: "frontier",
  kt_ask: "frontier",
  mermaid_repair: "light",
  narration: "light",
  ai_guide: "light",
};

/** Headroom over the estimated context so a turn doesn't overflow mid-run. */
const CONTEXT_HEADROOM = 1.2;

const scoreReason = (tier: RoutingTier): RouteReasonCode => {
  if (tier === "frontier") return "complex_task";
  if (tier === "standard") return "moderate_task";
  return "simple_task";
};

interface DecisionParts {
  candidate: RouteCandidate | null;
  source: DecisionSource;
  reasons: RouteReasonCode[];
  rejected: RejectedCandidate[];
  score?: number | null;
  confidence?: number | null;
}

function toDecision(
  req: RouteRequest,
  parts: DecisionParts,
  now: number,
): RoutingDecision {
  const profileName =
    parts.candidate?.profileName ?? req.currentProfile ?? null;
  return {
    id: uuidv4(),
    task: req.task,
    profileName,
    model: parts.candidate?.model ?? null,
    tier: parts.candidate?.tier ?? null,
    source: parts.source,
    reasons: parts.reasons,
    score: parts.score ?? null,
    confidence: parts.confidence ?? null,
    rejected: parts.rejected,
    switched:
      !!profileName &&
      !!req.currentProfile &&
      profileName !== req.currentProfile,
    at: now,
  };
}

export function routeSync(
  req: RouteRequest,
  ctx: RoutingContext,
  options: { classifierTier?: RoutingTier } = {},
): RouteOutcome {
  const { now, health, policy } = ctx;
  const rejected: RejectedCandidate[] = [];
  const reasons: RouteReasonCode[] = [];
  const done = (parts: Omit<DecisionParts, "rejected">, extra = {}) => ({
    decision: toDecision(req, { ...parts, rejected }, now),
    needsClassifier: false,
    wantedLower: false,
    ...extra,
  });

  // A manual pick always wins, even over exclusions and open circuits.
  if (req.overrideProfile) {
    const picked = ctx.candidates.find(
      (c) => c.profileName === req.overrideProfile,
    );
    if (picked) {
      return done({
        candidate: picked,
        source: "override",
        reasons: ["manual_override"],
      });
    }
  }

  const pool = ctx.candidates.filter((c) => {
    if (ctx.excludedProfiles.includes(c.profileName)) {
      rejected.push({ profileName: c.profileName, reason: "excluded" });
      return false;
    }
    return true;
  });
  if (pool.length === 0) {
    return done({
      candidate: null,
      source: "rule",
      reasons: ["no_candidates"],
    });
  }

  let eligible = filterAvailable(pool, health, now);
  pool
    .filter((c) => !eligible.includes(c))
    .forEach((c) =>
      rejected.push({ profileName: c.profileName, reason: "circuit_open" }),
    );
  // Every circuit open: trying something beats refusing outright.
  if (eligible.length === 0) eligible = pool;

  const current =
    ctx.candidates.find((c) => c.profileName === req.currentProfile) ?? null;
  const features = extractPromptFeatures(req.text ?? "");
  let forced = false;

  // --- Capability gates -----------------------------------------------------
  if (req.hasImages) {
    const vision = eligible.filter((c) => c.vision);
    if (vision.length > 0) {
      if (vision.length < eligible.length) reasons.push("vision_required");
      if (current && !current.vision) forced = true;
      eligible = vision;
    }
  }
  if (req.needsTools) {
    const tools = eligible.filter((c) => c.toolCalling);
    if (tools.length > 0 && tools.length < eligible.length) {
      reasons.push("tools_required");
      if (current && !current.toolCalling) forced = true;
      eligible = tools;
    }
  }
  const needed =
    ((req.contextTokens ?? 0) + features.estTokens) * CONTEXT_HEADROOM;
  if (needed > 0) {
    const fits = eligible.filter((c) => c.contextWindow >= needed);
    if (fits.length > 0 && fits.length < eligible.length) {
      reasons.push("context_fit");
      if (current && current.contextWindow < needed) forced = true;
      eligible = fits;
    }
  }

  if (eligible.length === 1) {
    return done({
      candidate: eligible[0],
      source: "rule",
      reasons: [...reasons, "single_candidate"],
    });
  }

  const currentEligible = !!current && eligible.includes(current);
  if (features.isCommand && currentEligible) {
    return done({
      candidate: current,
      source: "rule",
      reasons: [...reasons, "command_passthrough"],
    });
  }

  // --- Wanted tier ------------------------------------------------------------
  const preset = TASK_TIER_PRESET[req.task];
  let wanted: RoutingTier;
  let source: DecisionSource;
  let score: number | null = null;
  let confidence: number | null = null;
  let needsClassifier = false;

  if (preset) {
    wanted = preset;
    source = "preset";
    reasons.push("task_preset");
  } else {
    if (features.isTrivial && currentEligible && !forced) {
      return done({
        candidate: current,
        source: "sticky",
        reasons: [...reasons, "trivial_followup"],
        score: scoreComplexity(features),
      });
    }
    score = scoreComplexity(features);
    confidence = scoreConfidence(score, policy);
    if (options.classifierTier) {
      wanted = options.classifierTier;
      source = "classifier";
      reasons.push("classifier");
    } else {
      wanted = tierForScore(score, policy);
      source = "scorer";
      reasons.push(scoreReason(wanted));
      needsClassifier = !forced && isAmbiguous(score, policy);
    }
  }

  const budget = applyBudget(wanted, req.conversationCostUsd, ctx.budgetUsd);
  if (budget.downshift === "soft") reasons.push("budget_downshift");
  if (budget.downshift === "exhausted") reasons.push("budget_exhausted");
  wanted = budget.tier;

  let chosen = selectCandidate(wanted, eligible, policy, health, now);
  const wantedLower = !!current && TIER_RANK[wanted] < TIER_RANK[current.tier];

  // --- Hysteresis -------------------------------------------------------------
  if (
    chosen &&
    current &&
    currentEligible &&
    chosen.profileName !== current.profileName &&
    !forced &&
    !preset &&
    budget.downshift === "none"
  ) {
    const verdict = evaluateSticky({
      sticky: ctx.sticky,
      currentTier: current.tier,
      chosenTier: chosen.tier,
      margin: score === null ? 1 : downgradeMargin(score, policy, chosen.tier),
      now,
    });
    if (verdict === "hold") {
      chosen = current;
      source = "sticky";
      reasons.push("sticky_hold");
    }
  }

  return {
    decision: toDecision(
      req,
      { candidate: chosen, source, reasons, rejected, score, confidence },
      now,
    ),
    needsClassifier,
    wantedLower,
  };
}

export async function route(
  req: RouteRequest,
  ctx: RoutingContext,
  classifier?: RoutingClassifier | null,
): Promise<RouteOutcome> {
  const first = routeSync(req, ctx);
  if (!first.needsClassifier || !classifier || !req.text) return first;
  const tier = await classifier.classify(req.text);
  if (!tier) return first;
  return routeSync(req, ctx, { classifierTier: tier });
}
