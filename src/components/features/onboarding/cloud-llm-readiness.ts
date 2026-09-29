import { isSubscriptionLlmConfig } from "#/constants/llm-subscription";
import type { Settings } from "#/types/settings";

/**
 * True when Cloud settings already carry everything onboarding would collect
 * (a model plus an API key or subscription auth). Such users never see the
 * onboarding modal, so anything keyed off its completion must use this too.
 */
export function hasUsableCloudLlm(settings: Settings | undefined): boolean {
  const llm = settings?.agent_settings?.llm as
    | Record<string, unknown>
    | undefined;
  const hasModel =
    typeof llm?.model === "string" && llm.model.trim().length > 0;
  const hasAuth =
    settings?.llm_api_key_set === true || isSubscriptionLlmConfig(llm);
  return hasModel && hasAuth;
}
