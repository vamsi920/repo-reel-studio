import { describe, expect, it } from "vitest";
import type { OpenHandsEvent } from "#/types/agent-server/core";
import {
  isTurnOutputEvent,
  splitIntoTurns,
} from "#/components/features/thinking-graph/graph-transcript";

const message = (id: string, role: "user" | "assistant") =>
  ({
    id,
    timestamp: "2026-01-01T00:00:00Z",
    source: role === "user" ? "user" : "agent",
    llm_message: { role, content: [{ type: "text", text: id }] },
  }) as unknown as OpenHandsEvent;

const action = (id: string, kind: string) =>
  ({
    id,
    timestamp: "2026-01-01T00:00:00Z",
    source: "agent",
    thought: [],
    action: { kind, message: "done" },
    tool_name: kind,
    tool_call_id: `call-${id}`,
  }) as unknown as OpenHandsEvent;

describe("splitIntoTurns", () => {
  it("starts a new turn at every user message and keeps a leading turn for older history", () => {
    const turns = splitIntoTurns([
      action("old", "ExecuteBashAction"),
      message("u1", "user"),
      action("a1", "ExecuteBashAction"),
      message("u2", "user"),
      action("a2", "FinishAction"),
    ]);

    expect(turns.map((turn) => turn.events.map((e) => e.id))).toEqual([
      ["old"],
      ["u1", "a1"],
      ["u2", "a2"],
    ]);
  });
});

describe("isTurnOutputEvent", () => {
  it("treats the agent's finish and replies as output, not tool steps", () => {
    expect(isTurnOutputEvent(action("f", "FinishAction"))).toBe(true);
    expect(isTurnOutputEvent(message("r", "assistant"))).toBe(true);
    expect(isTurnOutputEvent(action("b", "ExecuteBashAction"))).toBe(false);
    expect(isTurnOutputEvent(message("u", "user"))).toBe(false);
  });
});
