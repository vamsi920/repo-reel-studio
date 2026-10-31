import { TEST_RESULT_PREFIX } from "#/constants/test-control";
import {
  AUTO_CONTINUE_MESSAGE,
  MID_PLAN_CONTINUE_MESSAGE,
} from "#/services/test-control";
import { LLM_RECOVERY_MESSAGE } from "#/lib/llm-recovery";
import { isMessageEvent } from "#/types/agent-server/type-guards";
import type { OpenHandsEvent } from "#/types/agent-server/core";
import { parseMessageFromEvent } from "#/components/conversation-events/chat/event-content-helpers/parse-message-from-event";

/**
 * Receipts the studio posts back to the agent ("[neotest result] {...}")
 * are plumbing, not conversation: the workbench already showed the outcome.
 * Hide them, and the runtime's own nudges, from the transcript -- same
 * treatment as Neo Synth receipts.
 */
export function isTestReceiptEvent(event: OpenHandsEvent): boolean {
  if (!isMessageEvent(event)) return false;
  if (event.source === "environment") return true;
  const text = parseMessageFromEvent(event).trim();
  if (
    text === AUTO_CONTINUE_MESSAGE ||
    text === MID_PLAN_CONTINUE_MESSAGE ||
    text === LLM_RECOVERY_MESSAGE
  ) {
    return true;
  }
  return text.startsWith(TEST_RESULT_PREFIX.trim());
}
