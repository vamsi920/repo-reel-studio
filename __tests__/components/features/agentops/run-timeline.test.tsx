import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { RunTimeline } from "#/components/features/agentops/run-timeline";
import type {
  AgentOpsRun,
  AgentOpsSpan,
} from "#/api/agentops-service/agentops-service.types";

function run(overrides: Partial<AgentOpsRun> = {}): AgentOpsRun {
  return {
    runId: "run-1",
    workspaceId: "/workspace/project",
    agentName: "agent",
    task: "Refactor the parser",
    status: "running",
    model: "anthropic/claude",
    phase: "code_edit",
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: null,
    updatedAt: "2026-01-01T00:00:05.000Z",
    costUsd: 0.42,
    maxBudgetPerTask: null,
    tokens: {
      prompt: 1,
      completion: 1,
      cacheRead: 0,
      cacheWrite: 0,
      reasoning: 0,
      total: 2,
    },
    toolCallCount: 1,
    llmCallCount: 0,
    errorCount: 0,
    artifacts: [],
    ...overrides,
  };
}

function span(overrides: Partial<AgentOpsSpan> = {}): AgentOpsSpan {
  return {
    spanId: "run-1:span-1",
    parentSpanId: null,
    traceId: "run-1",
    kind: "tool",
    name: "terminal",
    phase: "tool_call",
    startTime: "2026-01-01T00:00:00.000Z",
    endTime: "2026-01-01T00:00:02.000Z",
    status: "succeeded",
    attributes: { "tool.name": "terminal", "tool.status": "succeeded" },
    ...overrides,
  };
}

describe("RunTimeline", () => {
  it("shows the empty state and renders no lanes when there are no spans", () => {
    render(<RunTimeline run={run()} spans={[]} />);
    expect(screen.getByText("AGENTOPS$EMPTY_NO_SPANS")).toBeInTheDocument();
    expect(screen.queryByTestId("agentops-run-timeline")).toBeNull();
  });

  it("groups spans into their phase lane and counts them", () => {
    render(
      <RunTimeline
        run={run()}
        spans={[
          span({ spanId: "run-1:a", phase: "tool_call" }),
          span({ spanId: "run-1:b", phase: "tool_call", name: "grep" }),
          span({ spanId: "run-1:c", phase: "code_edit", name: "edit" }),
        ]}
      />,
    );
    expect(screen.getByTestId("agentops-run-timeline")).toBeInTheDocument();
    expect(screen.getByTestId("agentops-span-run-1:a")).toBeInTheDocument();
    expect(screen.getByTestId("agentops-span-run-1:b")).toBeInTheDocument();
    expect(screen.getByTestId("agentops-span-run-1:c")).toBeInTheDocument();
    // A phase lane never rendered for a phase with no spans at all.
    expect(screen.queryByText("AGENTOPS$PHASE_PLANNING")).toBeNull();
  });

  it("prompts for a selection until a span is clicked, then shows its attributes", async () => {
    const user = userEvent.setup();
    render(
      <RunTimeline
        run={run()}
        spans={[
          span({
            attributes: {
              "tool.name": "terminal",
              "tool.parameters": "ls -la",
              // Attributes with no value are not real telemetry and must not
              // render as an empty row in the inspector.
              "neodevex.security_risk": null,
            },
          }),
        ]}
      />,
    );

    expect(screen.getByText("AGENTOPS$SPAN_SELECT_HINT")).toBeInTheDocument();

    await user.click(screen.getByTestId("agentops-span-run-1:span-1"));

    expect(screen.queryByText("AGENTOPS$SPAN_SELECT_HINT")).toBeNull();
    expect(screen.getByText("tool.name")).toBeInTheDocument();
    expect(screen.getByText("tool.parameters")).toBeInTheDocument();
    expect(screen.getByText("ls -la")).toBeInTheDocument();
    expect(screen.queryByText("neodevex.security_risk")).toBeNull();
    expect(screen.getByTestId("agentops-span-run-1:span-1")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("switches the inspector when a different span is selected", async () => {
    const user = userEvent.setup();
    render(
      <RunTimeline
        run={run()}
        spans={[
          span({
            spanId: "run-1:a",
            name: "terminal",
            attributes: { "tool.parameters": "ls -la" },
          }),
          span({
            spanId: "run-1:b",
            name: "grep",
            attributes: { "tool.parameters": "grep -R foo" },
          }),
        ]}
      />,
    );

    await user.click(screen.getByTestId("agentops-span-run-1:a"));
    expect(screen.getByText("ls -la")).toBeInTheDocument();

    await user.click(screen.getByTestId("agentops-span-run-1:b"));
    expect(screen.getByText("grep -R foo")).toBeInTheDocument();
    expect(screen.queryByText("ls -la")).toBeNull();
    expect(screen.getByTestId("agentops-span-run-1:a")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByTestId("agentops-span-run-1:b")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
