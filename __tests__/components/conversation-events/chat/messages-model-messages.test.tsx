import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { renderWithProviders } from "test-utils";
import { Messages } from "#/components/conversation-events/chat/messages";
import { useModelStore } from "#/stores/model-store";
import {
  ActionEvent,
  MessageEvent,
  SecurityRisk,
} from "#/types/agent-server/core";
import { ExecuteBashAction } from "#/types/agent-server/core/base/action";
import { StreamingDeltaEvent } from "#/types/agent-server/core/events/streaming-delta-event";
import { ACPToolCallEvent } from "#/types/agent-server/core/events/acp-tool-call-event";

const CONVERSATION_ID = "test-conversation-id";

const makeBashAction = (id: string): ActionEvent<ExecuteBashAction> => ({
  id,
  timestamp: new Date().toISOString(),
  source: "agent",
  thought: [],
  thinking_blocks: [],
  action: {
    kind: "ExecuteBashAction",
    command: `echo ${id}`,
    is_input: false,
    timeout: null,
    reset: false,
  },
  tool_name: "execute_bash",
  tool_call_id: `call_${id}`,
  tool_call: {
    id: `call_${id}`,
    type: "function",
    function: {
      name: "execute_bash",
      arguments: JSON.stringify({ command: `echo ${id}` }),
    },
  },
  llm_response_id: `response_${id}`,
  security_risk: SecurityRisk.UNKNOWN,
});

const makeStreamingDelta = (content: string): StreamingDeltaEvent => ({
  id: "delta-1",
  timestamp: "2026-06-12T12:00:00Z",
  source: "agent",
  kind: "StreamingDeltaEvent",
  content,
  reasoning_content: null,
});

describe("Messages model entries", () => {
  beforeEach(() => {
    useModelStore.setState({ entriesByConversation: {} });
  });

  it("renders model entries anchored to non-last events inside grouped runs", () => {
    const first = makeBashAction("action-1");
    const second = makeBashAction("action-2");
    useModelStore.getState().show(CONVERSATION_ID, first.id, []);

    renderWithProviders(
      <Messages messages={[first, second]} allEvents={[first, second]} />,
    );

    expect(screen.getByTestId("model-messages")).toBeInTheDocument();
  });

  it("rerenders when a streaming delta is compacted under the same event id", () => {
    const firstDelta = makeStreamingDelta("First");
    const mergedDelta = makeStreamingDelta("First second third");

    const { rerender } = renderWithProviders(
      <Messages messages={[firstDelta]} allEvents={[firstDelta]} />,
    );

    expect(screen.getByText("First")).toBeInTheDocument();

    rerender(<Messages messages={[mergedDelta]} allEvents={[mergedDelta]} />);

    expect(screen.getByText("First second third")).toBeInTheDocument();
  });

  it("re-renders when an ACP tool-call event resolves in place instead of at the array tail", async () => {
    // `handleEventForUI` replaces a resolved ACPToolCallEvent at its
    // original index, not necessarily the last one, once other events
    // (e.g. this tail message) have already been appended after it.
    const user = userEvent.setup();
    const runningCall: ACPToolCallEvent = {
      kind: "ACPToolCallEvent",
      id: "tc-1a",
      timestamp: "2026-04-16T19:32:29.000000",
      source: "agent",
      tool_call_id: "call-1",
      title: "sleep 5",
      tool_kind: "execute",
      status: "in_progress",
      raw_input: { command: "sleep 5" },
      raw_output: null,
      content: null,
      is_error: false,
    };
    const failedCall: ACPToolCallEvent = {
      ...runningCall,
      id: "tc-1b",
      status: "failed",
      raw_output: "boom: command not found",
      is_error: true,
    };
    const tailMessage: MessageEvent = {
      id: "msg-tail",
      timestamp: "2026-04-16T19:32:30.000000",
      source: "agent",
      llm_message: {
        role: "assistant",
        content: [{ type: "text", text: "Still working on it" }],
      },
      activated_microagents: [],
      extended_content: [],
    };

    const { rerender } = renderWithProviders(
      <Messages
        messages={[runningCall, tailMessage]}
        allEvents={[runningCall, tailMessage]}
      />,
    );

    // Same length, same last-element reference — only index 0 changes.
    // The old memo comparator only checked length and the last element,
    // so it would (wrongly) treat these props as equal and skip the
    // re-render, leaving the card stuck showing "running".
    rerender(
      <Messages
        messages={[failedCall, tailMessage]}
        allEvents={[failedCall, tailMessage]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "BUTTON$EXPAND" }));

    expect(screen.getByText(/boom: command not found/)).toBeInTheDocument();
  });
});
