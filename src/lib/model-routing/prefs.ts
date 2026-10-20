import type { Settings } from "#/types/settings";
import {
  DEFAULT_ROUTING_MODE,
  DEFAULT_ROUTING_POLICY,
  ROUTING_MODES,
  ROUTING_POLICIES,
  type RoutingMode,
  type RoutingPolicy,
  type RoutingPreferences,
} from "./types";

const isMode = (v: unknown): v is RoutingMode =>
  (ROUTING_MODES as readonly unknown[]).includes(v);
const isPolicy = (v: unknown): v is RoutingPolicy =>
  (ROUTING_POLICIES as readonly unknown[]).includes(v);

/** Normalises the persisted app preferences (which may be null/stale). */
export function resolveRoutingPreferences(
  settings: Partial<Settings> | null | undefined,
): RoutingPreferences {
  const budget = settings?.model_routing_budget_usd;
  return {
    mode: isMode(settings?.model_routing_mode)
      ? settings.model_routing_mode
      : DEFAULT_ROUTING_MODE,
    policy: isPolicy(settings?.model_routing_policy)
      ? settings.model_routing_policy
      : DEFAULT_ROUTING_POLICY,
    budgetUsd: typeof budget === "number" && budget > 0 ? budget : null,
    excludedProfiles: Array.isArray(settings?.model_routing_excluded_profiles)
      ? settings.model_routing_excluded_profiles.filter(
          (p): p is string => typeof p === "string",
        )
      : [],
  };
}

/** Conversation override → global default. */
export function resolveRoutingMode(
  conversationMode: RoutingMode | null | undefined,
  globalMode: RoutingMode,
): RoutingMode {
  return isMode(conversationMode) ? conversationMode : globalMode;
}
