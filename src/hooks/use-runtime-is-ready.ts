import { useAgentState } from "#/hooks/use-agent-state";
import {
  RUNTIME_INACTIVE_STATES,
  RUNTIME_STARTING_STATES,
} from "#/types/agent-state";
import { useActiveConversation } from "./query/use-active-conversation";
import { isExecutionActive, isExecutionErrored } from "#/utils/status";

interface UseRuntimeIsReadyOptions {
  /**
   * The underlying sandbox process stays up when the agent/LLM loop errors
   * out (execution_status "error"/"stuck", AgentState.ERROR) — only the
   * agent's turn failed, not the runtime. Callers that just read the
   * workspace (files, terminal history, VSCode) rather than drive the
   * agent should pass this so they don't go dark on every LLM failure.
   */
  allowAgentError?: boolean;
}

export const useRuntimeIsReady = ({
  allowAgentError = false,
}: UseRuntimeIsReadyOptions = {}): boolean => {
  const { data: conversation } = useActiveConversation();
  const { curAgentState } = useAgentState();
  const inactiveStates = allowAgentError
    ? RUNTIME_STARTING_STATES
    : RUNTIME_INACTIVE_STATES;
  const executionStatus = conversation?.execution_status;
  const executionOk =
    isExecutionActive(executionStatus) ||
    (allowAgentError && isExecutionErrored(executionStatus));

  return executionOk && !inactiveStates.includes(curAgentState);
};
