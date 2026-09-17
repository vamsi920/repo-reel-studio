import { describe, expect, it } from "vitest";
import { findAwaitingConfirmationAction } from "#/components/shared/buttons/conversation-confirmation-buttons";
import type { OHEvent } from "#/stores/use-event-store";
import {
  ActionEvent,
  MessageEvent,
  SecurityRisk,
} from "#/types/agent-server/core";
import { StreamingDeltaEvent } from "#/types/agent-server/core/events/streaming-delta-event";

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

const mockStreamingDeltaEvent = (
  id: string,
  timestamp: string,
): StreamingDeltaEvent => ({
  id,
  timestamp,
  source: "agent",
  kind: "StreamingDeltaEvent",
  content: "some streamed text",
  reasoning_content: null,
});

const mockUserMessageEvent = (id: string, timestamp: string): MessageEvent => ({
  id,
  timestamp,
  source: "user",
  llm_message: { role: "user", content: [{ type: "text", text: "hi" }] },
  activated_microagents: [],
  extended_content: [],
});

describe("findAwaitingConfirmationAction", () => {
  it("returns undefined when there are no events", () => {
    expect(findAwaitingConfirmationAction([])).toBeUndefined();
  });

  it("returns undefined when no agent action is present", () => {
    const events: OHEvent[] = [mockUserMessageEvent("u1", "t1")];
    expect(findAwaitingConfirmationAction(events)).toBeUndefined();
  });

  it("finds the single pending high-risk action", () => {
    const action = mockActionEvent();
    const events: OHEvent[] = [
      mockUserMessageEvent("u1", "2024-03-01T00:00:00Z"),
      action,
    ];
    expect(findAwaitingConfirmationAction(events)).toBe(action);
  });

  it("does not mistake a later agent-sourced non-action event for the pending action", () => {
    // Regression: the pending action is still the real ActionEvent even when
    // a later agent-authored event (a streaming text delta here) sorts after
    // it in the event list — that later event carries no `security_risk` and
    // must never be reported as the thing awaiting confirmation.
    const action = mockActionEvent({
      id: "action-1",
      timestamp: "2024-03-01T00:00:01Z",
      security_risk: SecurityRisk.HIGH,
    });
    const trailingDelta = mockStreamingDeltaEvent(
      "delta-1",
      "2024-03-01T00:00:02Z",
    );
    const events: OHEvent[] = [action, trailingDelta];

    const result = findAwaitingConfirmationAction(events);
    expect(result).toBe(action);
    expect(result?.security_risk).toBe(SecurityRisk.HIGH);
  });

  it("picks the most recent action when several are present", () => {
    const older = mockActionEvent({
      id: "action-old",
      timestamp: "2024-03-01T00:00:01Z",
      security_risk: SecurityRisk.LOW,
    });
    const newer = mockActionEvent({
      id: "action-new",
      timestamp: "2024-03-01T00:00:02Z",
      security_risk: SecurityRisk.HIGH,
    });
    const events: OHEvent[] = [older, newer];

    expect(findAwaitingConfirmationAction(events)).toBe(newer);
  });
});
