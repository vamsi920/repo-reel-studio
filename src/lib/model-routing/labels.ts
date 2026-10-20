import { I18nKey } from "#/i18n/declaration";
import type { RouteReasonCode, RoutingPolicy, RoutingTier } from "./types";

/** One localized label per reason code, so decisions explain themselves. */
export const ROUTE_REASON_LABEL: Record<RouteReasonCode, I18nKey> = {
  manual_override: I18nKey.MODEL_ROUTING$REASON_MANUAL_OVERRIDE,
  single_candidate: I18nKey.MODEL_ROUTING$REASON_SINGLE_CANDIDATE,
  no_candidates: I18nKey.MODEL_ROUTING$REASON_NO_CANDIDATES,
  vision_required: I18nKey.MODEL_ROUTING$REASON_VISION_REQUIRED,
  context_fit: I18nKey.MODEL_ROUTING$REASON_CONTEXT_FIT,
  tools_required: I18nKey.MODEL_ROUTING$REASON_TOOLS_REQUIRED,
  trivial_followup: I18nKey.MODEL_ROUTING$REASON_TRIVIAL_FOLLOWUP,
  command_passthrough: I18nKey.MODEL_ROUTING$REASON_COMMAND_PASSTHROUGH,
  simple_task: I18nKey.MODEL_ROUTING$REASON_SIMPLE_TASK,
  moderate_task: I18nKey.MODEL_ROUTING$REASON_MODERATE_TASK,
  complex_task: I18nKey.MODEL_ROUTING$REASON_COMPLEX_TASK,
  task_preset: I18nKey.MODEL_ROUTING$REASON_TASK_PRESET,
  classifier: I18nKey.MODEL_ROUTING$REASON_CLASSIFIER,
  sticky_hold: I18nKey.MODEL_ROUTING$REASON_STICKY_HOLD,
  budget_downshift: I18nKey.MODEL_ROUTING$REASON_BUDGET_DOWNSHIFT,
  budget_exhausted: I18nKey.MODEL_ROUTING$REASON_BUDGET_EXHAUSTED,
  busy: I18nKey.MODEL_ROUTING$REASON_BUSY,
  fallback_rate_limit: I18nKey.MODEL_ROUTING$REASON_FALLBACK_RATE_LIMIT,
  fallback_unavailable: I18nKey.MODEL_ROUTING$REASON_FALLBACK_UNAVAILABLE,
  fallback_timeout: I18nKey.MODEL_ROUTING$REASON_FALLBACK_TIMEOUT,
  fallback_context_window: I18nKey.MODEL_ROUTING$REASON_FALLBACK_CONTEXT_WINDOW,
};

export const ROUTING_POLICY_LABEL: Record<RoutingPolicy, I18nKey> = {
  quality: I18nKey.MODEL_ROUTING$POLICY_QUALITY,
  balanced: I18nKey.MODEL_ROUTING$POLICY_BALANCED,
  economy: I18nKey.MODEL_ROUTING$POLICY_ECONOMY,
};

export const ROUTING_TIER_LABEL: Record<RoutingTier, I18nKey> = {
  light: I18nKey.MODEL_ROUTING$TIER_LIGHT,
  standard: I18nKey.MODEL_ROUTING$TIER_STANDARD,
  frontier: I18nKey.MODEL_ROUTING$TIER_FRONTIER,
};

/** The most specific reason to show in a one-line summary. */
export function primaryReason(
  reasons: RouteReasonCode[],
): RouteReasonCode | null {
  return reasons.length > 0 ? reasons[reasons.length - 1] : null;
}
