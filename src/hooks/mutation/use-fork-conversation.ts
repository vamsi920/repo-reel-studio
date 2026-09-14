import { useMutation, useQueryClient } from "@tanstack/react-query";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { DirectConversationInfo } from "#/api/agent-server-adapter";

interface ForkConversationVariables {
  /** The conversation being branched from. */
  sourceConversationId: string;
  /** The message the action was invoked on. */
  eventId: string;
  /** Set for an "edit message" branch: exclude the message and restore this text. */
  editText?: string | null;
  /** Optional title for the fork, so it reads distinctly from its source. */
  title?: string;
}

interface ForkConversationResult {
  info: DirectConversationInfo;
  /** Whether the message was excluded; the caller only prefills when true. */
  excluded: boolean;
}

/**
 * Branches a conversation from a message. Edit-mode (`editText` set) resolves
 * the message's parent (via getEventParentId) and branches there, excluding
 * the message; otherwise it branches at the message (inclusive). The very
 * first message in a conversation has no parent, so that case instead
 * branches at the message itself and falls back to prefilling if the
 * agent-server drops it (see the root-fallback comment below). Local
 * agent-server only.
 */
export const useForkConversation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["fork-conversation"],
    mutationFn: async ({
      sourceConversationId,
      eventId,
      editText,
      title,
    }: ForkConversationVariables): Promise<ForkConversationResult> => {
      let fromEventId = eventId;
      let excluded = false;
      // Set when editText is given but the message has no parent (it's the
      // conversation's first event): there's nothing to exclude to, so we
      // ask for an inclusive branch at the message itself instead.
      let isRootFallback = false;

      if (editText != null) {
        const parentId = await AgentServerConversationService.getEventParentId(
          sourceConversationId,
          eventId,
        );
        if (parentId) {
          fromEventId = parentId;
          excluded = true;
        } else {
          isRootFallback = true;
        }
      }

      const info = await AgentServerConversationService.forkConversation(
        sourceConversationId,
        fromEventId,
        title,
      );

      const leafEventId = (info as { leaf_event_id?: string | null })
        .leaf_event_id;

      // Older agent-servers (< 1.31.0) ignore `from_event_id` and copy the
      // whole conversation. When honored, the fork's HEAD is `fromEventId`; if
      // not, the message wasn't excluded — don't prefill (would duplicate).
      if (excluded && leafEventId !== fromEventId) {
        excluded = false;
      }

      // Root fallback: `fromEventId` is the message itself, so a correctly
      // honored inclusive branch has it as the fork's HEAD too. Some
      // agent-servers instead drop the very first event entirely, leaving an
      // empty fork with no matching leaf and the message lost on both ends —
      // recover it by prefilling the composer, same as the excluded path.
      if (isRootFallback && leafEventId !== fromEventId) {
        excluded = true;
      }

      return { info, excluded };
    },
    onSuccess: () => {
      // Surface the fork in the sidebar without wiping loaded pages.
      queryClient.invalidateQueries({ queryKey: ["user", "conversations"] });
    },
  });
};
