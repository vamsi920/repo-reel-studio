import { ONBOARDING_RESULT_PREFIX } from "#/constants/onboarding-control";
import type { OpenHandsEvent } from "#/types/agent-server/core";
import { isMessageEvent } from "#/types/agent-server/type-guards";
import { LLM_RECOVERY_MESSAGE } from "#/lib/llm-recovery";
import { parseMessageFromEvent } from "#/components/conversation-events/chat/event-content-helpers/parse-message-from-event";

/**
 * A chat message that is an onboarding receipt: the app's own
 * "[onboarding result] {...}" message to the agent, or the agent echoing one.
 *
 * The setup studio hides both. They are machine messages, shown to the user
 * as raw JSON, and the case study (case-studies/onboarding) found the agent
 * repeating them as its own replies in every round; the workbench already
 * shows what each one means.
 */
export function isOnboardingReceiptEvent(event: OpenHandsEvent): boolean {
  if (!isMessageEvent(event)) return false;
  const text = parseMessageFromEvent(event);
  if (text === LLM_RECOVERY_MESSAGE) return true;
  return text.trimStart().startsWith(ONBOARDING_RESULT_PREFIX.trim());
}
