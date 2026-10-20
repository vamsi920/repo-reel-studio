import { MODERNIZATION_RESULT_PREFIX } from "#/constants/modernization-control";
import { isMessageEvent } from "#/types/agent-server/type-guards";
import type { OpenHandsEvent } from "#/types/agent-server/core";
import { parseMessageFromEvent } from "#/components/conversation-events/chat/event-content-helpers/parse-message-from-event";

/**
 * Receipts the studio posts back to the agent ("[neome result] {...}") are
 * plumbing, not conversation: the workbench already showed the outcome. Hide
 * them (and any agent echo of them) from the transcript.
 */
export function isModernizationReceiptEvent(event: OpenHandsEvent): boolean {
  if (!isMessageEvent(event)) return false;
  return parseMessageFromEvent(event)
    .trimStart()
    .startsWith(MODERNIZATION_RESULT_PREFIX.trim());
}
