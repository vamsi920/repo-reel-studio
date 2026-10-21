import { MODERNIZATION_RESULT_PREFIX } from "#/constants/modernization-control";
import {
  AUTO_CONTINUE_MESSAGE,
  MID_PLAN_CONTINUE_MESSAGE,
  STUCK_CONTINUE_MESSAGE,
} from "#/services/modernization-control";
import { isMessageEvent } from "#/types/agent-server/type-guards";
import type { OpenHandsEvent } from "#/types/agent-server/core";
import { parseMessageFromEvent } from "#/components/conversation-events/chat/event-content-helpers/parse-message-from-event";

/**
 * Receipts the studio posts back to the agent ("[neome result] {...}") are
 * plumbing, not conversation: the workbench already showed the outcome. Hide
 * them (and any agent echo of them) from the transcript. So are the
 * runtime's own nudges (`source: "environment"`, e.g. "Your last response did
 * not include a function call..."), which Gemini triggers after every
 * fire-and-forget client tool call and which read as if the user wrote them.
 */
export function isModernizationReceiptEvent(event: OpenHandsEvent): boolean {
  if (!isMessageEvent(event)) return false;
  if (event.source === "environment") return true;
  const text = parseMessageFromEvent(event);
  // The studio's own "keep going" nudges are plumbing too.
  if (
    text === AUTO_CONTINUE_MESSAGE ||
    text === MID_PLAN_CONTINUE_MESSAGE ||
    text === STUCK_CONTINUE_MESSAGE
  )
    return true;
  return text.trimStart().startsWith(MODERNIZATION_RESULT_PREFIX.trim());
}
