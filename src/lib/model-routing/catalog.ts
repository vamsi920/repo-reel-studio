import type { ProfileInfo } from "@openhands/typescript-client";
import { lookupModelPricing } from "#/lib/workspace-memory/model-pricing";
import type { RouteCandidate, RoutingTier } from "./types";

/**
 * Static capability knowledge about model families. Matching is
 * longest-fragment-first (like `lookupModelPricing`) so
 * `gemini/gemini-2.5-flash-lite` resolves through `gemini-2.5-flash-lite`
 * before `gemini-2.5-flash`.
 *
 * Tiers are relative strength buckets for routing, not marketing claims:
 * `light` = fast/cheap, `standard` = solid generalist, `frontier` = the
 * strongest reasoning/coding models.
 */
// @spec MR-002 — Capability catalog
export interface ModelCapabilities {
  tier: RoutingTier;
  vision: boolean;
  toolCalling: boolean;
  contextWindow: number;
}

const M = 1_000_000;
const K = 1_000;

const cap = (
  tier: RoutingTier,
  contextWindow: number,
  vision = true,
  toolCalling = true,
): ModelCapabilities => ({ tier, vision, toolCalling, contextWindow });

const CAPABILITY_TABLE: Record<string, ModelCapabilities> = {
  // Google
  "gemini-4": cap("frontier", M),
  "gemini-3.1-pro": cap("frontier", M),
  "gemini-3-pro": cap("frontier", M),
  "gemini-2.5-pro": cap("frontier", M),
  "gemini-pro-latest": cap("frontier", M),
  "gemini-2.5-flash-lite": cap("light", M),
  "gemini-flash-lite-latest": cap("light", M),
  "gemini-3.8-flash": cap("standard", M),
  "gemini-2.5-flash": cap("light", M),
  "gemini-flash-latest": cap("light", M),
  "gemini-2.0-flash": cap("light", M),
  // Anthropic
  "claude-opus": cap("frontier", 200 * K),
  "claude-sonnet": cap("frontier", 200 * K),
  "claude-3-7-sonnet": cap("standard", 200 * K),
  "claude-3-5-sonnet": cap("standard", 200 * K),
  "claude-haiku": cap("light", 200 * K),
  "claude-3-5-haiku": cap("light", 200 * K),
  // OpenAI
  "gpt-5-nano": cap("light", 400 * K),
  "gpt-5-mini": cap("standard", 400 * K),
  "gpt-5": cap("frontier", 400 * K),
  "gpt-4.1-nano": cap("light", M),
  "gpt-4.1-mini": cap("light", M),
  "gpt-4.1": cap("standard", M),
  "gpt-4o-mini": cap("light", 128 * K),
  "gpt-4o": cap("standard", 128 * K),
  "o4-mini": cap("standard", 200 * K),
  o3: cap("frontier", 200 * K),
  // Open-weight / other
  "deepseek-r1": cap("frontier", 128 * K, false),
  "deepseek-reasoner": cap("frontier", 128 * K, false),
  deepseek: cap("standard", 128 * K, false),
  "qwen3-coder": cap("standard", 256 * K, false),
  "kimi-k2": cap("standard", 128 * K, false),
  "glm-": cap("standard", 128 * K, false),
  minimax: cap("standard", 200 * K, false),
  "grok-4": cap("frontier", 256 * K),
  "mistral-large": cap("standard", 128 * K, false),
  "mistral-small": cap("light", 128 * K, false),
  devstral: cap("standard", 128 * K, false),
  llama: cap("light", 128 * K, false),
};

const SORTED_KEYS = Object.keys(CAPABILITY_TABLE).sort(
  (a, b) => b.length - a.length,
);

/** Conservative defaults for a model we know nothing about. */
export const UNKNOWN_MODEL_CAPABILITIES: ModelCapabilities = cap(
  "standard",
  128 * K,
  false,
  true,
);

export function lookupModelCapabilities(
  model: string | null | undefined,
): ModelCapabilities {
  if (!model) return UNKNOWN_MODEL_CAPABILITIES;
  const normalized = model.trim().toLowerCase();
  const match = SORTED_KEYS.find((key) => normalized.includes(key));
  return match ? CAPABILITY_TABLE[match] : UNKNOWN_MODEL_CAPABILITIES;
}

/** Input-weighted blend (3:1) — agent turns are prompt-heavy. */
export function blendedCostPerMTok(model: string): number | null {
  const pricing = lookupModelPricing(model);
  if (!pricing) return null;
  return (pricing.inputPerMTok * 3 + pricing.outputPerMTok) / 4;
}

/** Non-secret profile config fields that refine the static catalog. */
export interface ProfileConfigHints {
  max_input_tokens?: unknown;
  disable_vision?: unknown;
  native_tool_calling?: unknown;
}

export function buildCandidates(
  profiles: ProfileInfo[],
  hintsByProfile: Record<string, ProfileConfigHints | undefined> = {},
): RouteCandidate[] {
  return profiles
    .filter((p) => typeof p.model === "string" && p.model.trim().length > 0)
    .map((profile) => {
      const model = profile.model as string;
      const caps = lookupModelCapabilities(model);
      const hints = hintsByProfile[profile.name];
      const maxInput =
        typeof hints?.max_input_tokens === "number" &&
        hints.max_input_tokens > 0
          ? hints.max_input_tokens
          : null;
      return {
        profileName: profile.name,
        model,
        tier: caps.tier,
        vision: hints?.disable_vision === true ? false : caps.vision,
        toolCalling:
          hints?.native_tool_calling === false ? false : caps.toolCalling,
        contextWindow: maxInput ?? caps.contextWindow,
        costPerMTok: blendedCostPerMTok(model),
      };
    });
}
