import { describe, expect, it } from "vitest";
import {
  matchTracesToTasks,
  parseSubagentTrace,
} from "#/components/features/thinking-graph/subagent-trace";

const lines = (...events: object[]) =>
  events.map((e) => JSON.stringify(e)).join("\n\n");

describe("parseSubagentTrace", () => {
  it("turns hook events into steps that finish, fail, or are still running", () => {
    const text =
      lines(
        { event_type: "UserPromptSubmit", message: " find the bug " },
        {
          event_type: "PreToolUse",
          tool_name: "terminal",
          tool_input: { command: "rg bug" },
        },
        {
          event_type: "PostToolUse",
          tool_name: "terminal",
          tool_response: { exit_code: 0 },
        },
        {
          event_type: "PreToolUse",
          tool_name: "terminal",
          tool_input: { command: "npm test" },
        },
        {
          event_type: "PostToolUse",
          tool_name: "terminal",
          tool_response: { exit_code: 1 },
        },
        {
          event_type: "PreToolUse",
          tool_name: "file_editor",
          tool_input: { path: "/a.ts" },
        },
      ) + '\n{"event_type": "PostTo';

    const trace = parseSubagentTrace("s1", text);

    expect(trace.prompt).toBe("find the bug");
    expect(trace.steps.map((s) => [s.label, s.status])).toEqual([
      ["rg bug", "done"],
      ["npm test", "error"],
      ["/a.ts", "running"],
    ]);
    expect(trace.finished).toBe(false);
  });
});

describe("matchTracesToTasks", () => {
  it("links each task to the trace started with its exact prompt", () => {
    const trace = (sessionId: string, prompt: string) => ({
      sessionId,
      prompt,
      steps: [],
      finished: true,
    });

    const matched = matchTracesToTasks(
      [trace("a", "explore auth"), trace("b", "run tests")],
      [
        { id: "t1", prompt: "run tests" },
        { id: "t2", prompt: "explore auth" },
        { id: "t3", prompt: "unrelated" },
      ],
    );

    expect(matched.get("t1")?.sessionId).toBe("b");
    expect(matched.get("t2")?.sessionId).toBe("a");
    expect(matched.has("t3")).toBe(false);
  });
});
