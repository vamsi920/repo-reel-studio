import type { TFunction } from "i18next";
import { I18nKey } from "#/i18n/declaration";

/**
 * The collector labels runs without an agent profile "OpenHands Agent"
 * (the runtime's name). That string is also the key per-agent budgets are
 * stored under, so it stays as is on the wire; the product name is shown.
 */
export const RUNTIME_DEFAULT_AGENT_NAME = "OpenHands Agent";

export function displayAgentName(name: string, t: TFunction): string {
  return name === RUNTIME_DEFAULT_AGENT_NAME
    ? t(I18nKey.AGENTOPS$DEFAULT_AGENT_NAME)
    : name;
}
