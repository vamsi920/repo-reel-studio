import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useAgentState } from "#/hooks/use-agent-state";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import {
  prepareChatTurn,
  type PreparedTurn,
} from "#/lib/model-routing/runtime";

/**
 * Auto mode's pre-send step: routes the user's turn and, when the router
 * picks a different profile, switches the conversation's LLM before the
 * message goes out. A no-op in manual mode, for ACP agents, and while the
 * agent is mid-run (a message sent then joins the running loop, and swapping
 * the LLM mid-step is unsafe).
 */
// @spec MR-014 — Route before send
export function useAutoModelRouting() {
  const queryClient = useQueryClient();
  const { executionStatus } = useAgentState();
  const { data: conversation } = useActiveConversation();
  const isAcp = conversation?.agent_kind === "acp";

  return useCallback(
    (args: {
      conversationId: string;
      text: string;
      hasImages: boolean;
    }): Promise<PreparedTurn | null> =>
      prepareChatTurn({
        ...args,
        isBusy: executionStatus === ExecutionStatus.RUNNING,
        isAcp,
        queryClient,
      }),
    [executionStatus, isAcp, queryClient],
  );
}
