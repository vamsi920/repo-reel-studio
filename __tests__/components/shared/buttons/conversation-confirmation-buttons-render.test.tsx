import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "test-utils";
import { ConversationConfirmationButtons } from "#/components/shared/buttons/conversation-confirmation-buttons";
import { useEventStore, type OHEvent } from "#/stores/use-event-store";
import { useEventMessageStore } from "#/stores/event-message-store";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useAgentState } from "#/hooks/use-agent-state";
import { useRespondToConfirmation } from "#/hooks/mutation/use-respond-to-confirmation";
import { AgentState } from "#/types/agent-state";
import { ActionEvent, SecurityRisk } from "#/types/agent-server/core";

vi.mock("#/hooks/query/use-active-conversation");
vi.mock("#/hooks/use-agent-state");
vi.mock("#/hooks/mutation/use-respond-to-confirmation");

const mockActionEvent = (
  overrides: Partial<ActionEvent> = {},
): ActionEvent => ({
  id: "action-1",
  timestamp: "2024-03-01T00:00:01Z",
  source: "agent",
  thought: [{ type: "text", text: "I need to execute a bash command" }],
  thinking_blocks: [],
  action: {
    kind: "ExecuteBashAction",
    command: "rm -rf /",
    is_input: false,
    timeout: null,
    reset: false,
  },
  tool_name: "execute_bash",
  tool_call_id: "call_1",
  tool_call: {
    id: "call_1",
    type: "function",
    function: { name: "execute_bash", arguments: "{}" },
  },
  llm_response_id: "response_1",
  security_risk: SecurityRisk.HIGH,
  ...overrides,
});

const respondToConfirmationMock = vi.fn();

function mockRespondToConfirmation() {
  vi.mocked(useRespondToConfirmation).mockReturnValue({
    mutate: respondToConfirmationMock,
  } as unknown as ReturnType<typeof useRespondToConfirmation>);
}

function mockActiveConversation(data: Record<string, unknown> | undefined) {
  vi.mocked(useActiveConversation).mockReturnValue({
    data,
  } as unknown as ReturnType<typeof useActiveConversation>);
}

function setUpAwaitingConfirmation(action: ActionEvent) {
  vi.mocked(useAgentState).mockReturnValue({
    curAgentState: AgentState.AWAITING_USER_CONFIRMATION,
  });
  mockActiveConversation({
    id: "conversation-1",
    conversation_url: "https://example.test/conversation-1",
    session_api_key: "session-key",
  });
  mockRespondToConfirmation();
  useEventStore.setState({ events: [action] as OHEvent[] });
}

describe("ConversationConfirmationButtons", () => {
  beforeEach(() => {
    respondToConfirmationMock.mockReset();
    useEventStore.setState({ events: [] });
    useEventMessageStore.setState({ submittedEventIds: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when the agent is not awaiting confirmation", () => {
    vi.mocked(useAgentState).mockReturnValue({
      curAgentState: AgentState.RUNNING,
    });
    mockActiveConversation({ id: "conversation-1" });
    mockRespondToConfirmation();
    useEventStore.setState({ events: [mockActionEvent()] as OHEvent[] });

    const { container } = renderWithProviders(
      <ConversationConfirmationButtons />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing once the pending action has already been submitted", () => {
    setUpAwaitingConfirmation(mockActionEvent());
    useEventMessageStore.setState({ submittedEventIds: ["action-1"] });

    const { container } = renderWithProviders(
      <ConversationConfirmationButtons />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the high-risk warning and both action buttons for a HIGH-risk pending action", () => {
    setUpAwaitingConfirmation(
      mockActionEvent({ security_risk: SecurityRisk.HIGH }),
    );

    renderWithProviders(<ConversationConfirmationButtons />);

    expect(screen.getByText("COMMON$HIGH_RISK")).toBeInTheDocument();
    expect(screen.getByTestId("action-confirm-button")).toBeInTheDocument();
    expect(screen.getByTestId("action-reject-button")).toBeInTheDocument();
  });

  it("does not show the high-risk warning for a non-HIGH-risk pending action", () => {
    setUpAwaitingConfirmation(
      mockActionEvent({ security_risk: SecurityRisk.LOW }),
    );

    renderWithProviders(<ConversationConfirmationButtons />);

    expect(screen.queryByText("COMMON$HIGH_RISK")).not.toBeInTheDocument();
    expect(screen.getByTestId("action-confirm-button")).toBeInTheDocument();
  });

  it("responds with accept: true and marks the action submitted when Confirm is clicked", () => {
    setUpAwaitingConfirmation(mockActionEvent());

    renderWithProviders(<ConversationConfirmationButtons />);
    fireEvent.click(screen.getByTestId("action-confirm-button"));

    expect(respondToConfirmationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conversation-1",
        accept: true,
      }),
    );
    expect(useEventMessageStore.getState().submittedEventIds).toContain(
      "action-1",
    );
  });

  it("responds with accept: false when Reject is clicked", () => {
    setUpAwaitingConfirmation(mockActionEvent());

    renderWithProviders(<ConversationConfirmationButtons />);
    fireEvent.click(screen.getByTestId("action-reject-button"));

    expect(respondToConfirmationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conversation-1",
        accept: false,
      }),
    );
  });

  it("confirms on Cmd+Enter", () => {
    setUpAwaitingConfirmation(mockActionEvent());

    renderWithProviders(<ConversationConfirmationButtons />);
    fireEvent.keyDown(document, { key: "Enter", metaKey: true });

    expect(respondToConfirmationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accept: true }),
    );
  });

  it("rejects on Shift+Cmd+Backspace", () => {
    setUpAwaitingConfirmation(mockActionEvent());

    renderWithProviders(<ConversationConfirmationButtons />);
    fireEvent.keyDown(document, {
      key: "Backspace",
      shiftKey: true,
      metaKey: true,
    });

    expect(respondToConfirmationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accept: false }),
    );
  });

  it("no-ops on Confirm/Reject while the active conversation has not loaded yet", () => {
    vi.mocked(useAgentState).mockReturnValue({
      curAgentState: AgentState.AWAITING_USER_CONFIRMATION,
    });
    mockActiveConversation(undefined);
    mockRespondToConfirmation();
    useEventStore.setState({ events: [mockActionEvent()] as OHEvent[] });

    renderWithProviders(<ConversationConfirmationButtons />);
    fireEvent.click(screen.getByTestId("action-confirm-button"));

    expect(respondToConfirmationMock).not.toHaveBeenCalled();
    expect(useEventMessageStore.getState().submittedEventIds).toEqual([]);
  });

  it("does not respond to a plain Enter or Backspace without the modifier keys", () => {
    setUpAwaitingConfirmation(mockActionEvent());

    renderWithProviders(<ConversationConfirmationButtons />);
    fireEvent.keyDown(document, { key: "Enter" });
    fireEvent.keyDown(document, { key: "Backspace" });

    expect(respondToConfirmationMock).not.toHaveBeenCalled();
  });
});
