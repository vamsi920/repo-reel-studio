/**
 * Shared vocabulary for NeoDevEx model routing ("Auto" mode).
 *
 * Routing is app-side: the pinned agent-server has no meta-profile router, so
 * the frontend chooses among the user's saved LLM profiles and applies the
 * choice through the existing per-conversation `switchLLM` path. Every model
 * reference here is a saved profile, never a raw key.
 */

// @spec MR-001 — Routing modes, policies and tiers
export const ROUTING_MODES = ["auto", "manual"] as const;
export type RoutingMode = (typeof ROUTING_MODES)[number];

export const ROUTING_POLICIES = ["quality", "balanced", "economy"] as const;
export type RoutingPolicy = (typeof ROUTING_POLICIES)[number];

export const ROUTING_TIERS = ["light", "standard", "frontier"] as const;
export type RoutingTier = (typeof ROUTING_TIERS)[number];

export const TIER_RANK: Record<RoutingTier, number> = {
  light: 0,
  standard: 1,
  frontier: 2,
};

export const DEFAULT_ROUTING_MODE: RoutingMode = "manual";
export const DEFAULT_ROUTING_POLICY: RoutingPolicy = "balanced";

export type RouteTask =
  | "chat_turn"
  | "conversation_start"
  | "kt_generate"
  | "kt_ask"
  | "mermaid_repair"
  | "narration"
  | "ai_guide";

/** Why a decision went the way it did. Each code has an i18n key. */
export type RouteReasonCode =
  | "manual_override"
  | "single_candidate"
  | "no_candidates"
  | "vision_required"
  | "context_fit"
  | "tools_required"
  | "trivial_followup"
  | "command_passthrough"
  | "simple_task"
  | "moderate_task"
  | "complex_task"
  | "task_preset"
  | "classifier"
  | "sticky_hold"
  | "budget_downshift"
  | "budget_exhausted"
  | "busy"
  | "fallback_rate_limit"
  | "fallback_unavailable"
  | "fallback_timeout"
  | "fallback_context_window";

export type DecisionSource =
  | "override"
  | "rule"
  | "scorer"
  | "classifier"
  | "sticky"
  | "preset"
  | "fallback";

/** A saved LLM profile enriched with what the router needs to know. */
export interface RouteCandidate {
  profileName: string;
  model: string;
  tier: RoutingTier;
  vision: boolean;
  toolCalling: boolean;
  contextWindow: number;
  /** Blended USD per million tokens, or null when pricing is unknown. */
  costPerMTok: number | null;
}

export interface RouteRequest {
  task: RouteTask;
  /** The user's own text — never the injected memory/KT blocks. */
  text?: string;
  hasImages?: boolean;
  needsTools?: boolean;
  /** Tokens already in the conversation's context window. */
  contextTokens?: number;
  conversationId?: string | null;
  /** Profile the conversation is on right now. */
  currentProfile?: string | null;
  /** A manual pick always wins. */
  overrideProfile?: string | null;
  /** Spend so far, for budget-aware downshifting. */
  conversationCostUsd?: number;
}

export interface RejectedCandidate {
  profileName: string;
  reason: RouteReasonCode | "circuit_open" | "excluded";
}

export interface RoutingDecision {
  id: string;
  task: RouteTask;
  /** Null only when there is nothing to route to. */
  profileName: string | null;
  model: string | null;
  tier: RoutingTier | null;
  source: DecisionSource;
  reasons: RouteReasonCode[];
  /** Complexity score 0..1 (chat turns only). */
  score: number | null;
  confidence: number | null;
  rejected: RejectedCandidate[];
  /** True when the decision differs from the current profile. */
  switched: boolean;
  at: number;
}

export interface RoutingPreferences {
  mode: RoutingMode;
  policy: RoutingPolicy;
  /** Per-conversation soft budget in USD; null/0 disables it. */
  budgetUsd: number | null;
  excludedProfiles: string[];
}
