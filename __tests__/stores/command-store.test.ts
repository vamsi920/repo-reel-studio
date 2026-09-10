import { beforeEach, describe, expect, it } from "vitest";
import { commandFromEvent, useCommandStore } from "#/stores/command-store";
import type { OpenHandsEvent } from "#/types/agent-server/core";

const bashAction = (command: string): OpenHandsEvent =>
  ({
    id: "bash-1",
    timestamp: "2026-09-10T00:00:00.000Z",
    source: "agent",
    thought: [],
    thinking_blocks: [],
    action: {
      kind: "ExecuteBashAction",
      command,
      is_input: false,
      timeout: null,
      reset: false,
    },
    tool_name: "execute_bash",
    tool_call_id: "call-1",
    tool_call: {
      id: "call-1",
      type: "function",
      function: { name: "execute_bash", arguments: "{}" },
    },
    llm_response_id: "resp-1",
    security_risk: "UNKNOWN",
  }) as unknown as OpenHandsEvent;

const bashObservation = (
  content: Array<{ type: string; text?: string }>,
): OpenHandsEvent =>
  ({
    id: "bash-obs-1",
    timestamp: "2026-09-10T00:00:01.000Z",
    source: "environment",
    action_id: "bash-1",
    tool_name: "execute_bash",
    tool_call_id: "call-1",
    observation: {
      kind: "ExecuteBashObservation",
      content,
      command: "run",
      exit_code: 0,
      error: false,
      timeout: false,
      metadata: {},
    },
  }) as unknown as OpenHandsEvent;

describe("commandFromEvent", () => {
  it("maps a bash action to a terminal input line", () => {
    expect(commandFromEvent(bashAction("ls -la"))).toEqual({
      content: "ls -la",
      type: "input",
    });
  });

  it("joins the text parts of a bash observation into one output line", () => {
    expect(
      commandFromEvent(
        bashObservation([
          { type: "text", text: "a.txt" },
          { type: "image", text: "ignored" },
          { type: "text", text: "b.txt" },
        ]),
      ),
    ).toEqual({ content: "a.txt\nb.txt", type: "output" });
  });

  it("ignores events that are not bash actions or observations", () => {
    const message = {
      id: "msg-1",
      timestamp: "2026-09-10T00:00:00.000Z",
      source: "user",
      llm_message: { role: "user", content: [{ type: "text", text: "hi" }] },
      activated_microagents: [],
      extended_content: [],
    } as unknown as OpenHandsEvent;

    expect(commandFromEvent(message)).toBeNull();
  });
});

describe("useCommandStore.appendCommands", () => {
  beforeEach(() => {
    useCommandStore.setState({ commands: [] });
  });

  it("appends a batch after the existing commands, in order", () => {
    useCommandStore.getState().appendInput("echo first");
    useCommandStore
      .getState()
      .appendCommands([
        { content: "echo second", type: "input" },
        { content: "second", type: "output" },
      ]);

    expect(useCommandStore.getState().commands).toEqual([
      { content: "echo first", type: "input" },
      { content: "echo second", type: "input" },
      { content: "second", type: "output" },
    ]);
  });

  it("is a no-op for an empty batch, keeping the same array identity", () => {
    useCommandStore.getState().appendInput("echo first");
    const before = useCommandStore.getState().commands;

    useCommandStore.getState().appendCommands([]);

    expect(useCommandStore.getState().commands).toBe(before);
  });
});
