import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "test-utils";
import { EventMessage } from "#/components/conversation-events/chat/event-message";
import { buildActionsById } from "#/components/conversation-events/chat/event-thought-helpers";
import { useAgentState } from "#/hooks/use-agent-state";
import { AgentState } from "#/types/agent-state";
import {
  ActionEvent,
  ObservationEvent,
  SecurityRisk,
} from "#/types/agent-server/core";
import { ExecuteBashAction } from "#/types/agent-server/core/base/action";
import { ExecuteBashObservation } from "#/types/agent-server/core/base/observation";

// Mock useConfig
vi.mock("#/hooks/query/use-config", () => ({
  useConfig: () => ({ data: {} }),
}));

// Mock useAgentState
vi.mock("#/hooks/use-agent-state");

// Mock useConversationId
vi.mock("#/hooks/use-conversation-id", () => ({
  useOptionalConversationId: () => ({ conversationId: "test-conversation-id" }),
  useConversationId: () => ({ conversationId: "test-conversation-id" }),
}));

const createBashActionEvent = (
  id: string,
  thoughtText: string,
): ActionEvent<ExecuteBashAction> => ({
  id,
  timestamp: new Date().toISOString(),
  source: "agent",
  thought: [{ type: "text", text: thoughtText }],
  thinking_blocks: [],
  action: {
    kind: "ExecuteBashAction",
    command: "echo hello",
    is_input: false,
    timeout: null,
    reset: false,
  },
  tool_name: "execute_bash",
  tool_call_id: `call_${id}`,
  tool_call: {
    id: `call_${id}`,
    type: "function",
    function: { name: "execute_bash", arguments: "{}" },
  },
  llm_response_id: `response_${id}`,
  security_risk: SecurityRisk.UNKNOWN,
});

const createBashObservationEvent = (
  id: string,
  actionId: string,
): ObservationEvent<ExecuteBashObservation> => ({
  id,
  timestamp: new Date().toISOString(),
  source: "environment",
  tool_name: "execute_bash",
  tool_call_id: `call_${actionId}`,
  action_id: actionId,
  observation: {
    kind: "ExecuteBashObservation",
    content: [{ type: "text", text: "hello" }],
    command: "echo hello",
    exit_code: 0,
    error: false,
    timeout: false,
    metadata: { exit_code: 0 },
  } as ExecuteBashObservation,
});

// @spec covers the O(1) actionsById lookup added to EventMessage's
// observation branch, and its equivalence with the linear-scan fallback.
describe("EventMessage - observation corresponding-action lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAgentState).mockReturnValue({ curAgentState: AgentState.INIT });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the corresponding action's thought via the precomputed actionsById map", () => {
    const action = createBashActionEvent("action-1", "Checking the output");
    const observation = createBashObservationEvent("obs-1", "action-1");
    const actionsById = buildActionsById([action, observation]);

    renderWithProviders(
      <EventMessage
        event={observation}
        messages={[action, observation]}
        actionsById={actionsById}
        isLastMessage={false}
        isInLast10Actions={false}
      />,
    );

    expect(screen.getByText("Checking the output")).toBeInTheDocument();
  });

  it("falls back to scanning messages when actionsById is not provided", () => {
    const action = createBashActionEvent("action-2", "Checking the output");
    const observation = createBashObservationEvent("obs-2", "action-2");

    renderWithProviders(
      <EventMessage
        event={observation}
        messages={[action, observation]}
        isLastMessage={false}
        isInLast10Actions={false}
      />,
    );

    expect(screen.getByText("Checking the output")).toBeInTheDocument();
  });
});
