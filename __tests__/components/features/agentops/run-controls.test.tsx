import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RunControls } from "#/components/features/agentops/run-controls";
import type {
  AgentOpsRun,
  AgentOpsRunStatus,
} from "#/api/agentops-service/agentops-service.types";

function run(status: AgentOpsRunStatus): AgentOpsRun {
  return {
    runId: "run-1",
    workspaceId: "/workspace/project",
    agentName: "agent",
    task: "Refactor the parser",
    status,
    model: "anthropic/claude",
    phase: "code_edit",
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: null,
    updatedAt: "2026-01-01T00:01:00.000Z",
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
    toolCallCount: 3,
    llmCallCount: 2,
    errorCount: 0,
    artifacts: [],
  };
}

function renderControls(status: AgentOpsRunStatus) {
  return render(<RunControls run={run(status)} />, {
    wrapper: ({ children }) => (
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        {children}
      </QueryClientProvider>
    ),
  });
}

describe("RunControls", () => {
  it("offers Pause and Stop on a running run", () => {
    renderControls("running");
    expect(screen.getByTestId("agentops-run-pause")).toBeInTheDocument();
    expect(screen.getByTestId("agentops-run-stop")).toBeInTheDocument();
    expect(screen.queryByTestId("agentops-run-resume")).toBeNull();
    expect(screen.queryByTestId("agentops-run-stuck-note")).toBeNull();
  });

  it("offers Resume and Stop on a paused run", () => {
    renderControls("paused");
    expect(screen.getByTestId("agentops-run-resume")).toBeInTheDocument();
    expect(screen.getByTestId("agentops-run-stop")).toBeInTheDocument();
    expect(screen.queryByTestId("agentops-run-pause")).toBeNull();
  });

  it("renders no controls on a stuck run, only an explanation", () => {
    // The runtime ignores /interrupt on a stuck conversation and /run
    // re-trips the stuck detector immediately, so Pause/Stop/Resume would all
    // be controls that don't act. Say what happened and what to do instead.
    renderControls("stuck");
    expect(screen.queryByTestId("agentops-run-pause")).toBeNull();
    expect(screen.queryByTestId("agentops-run-stop")).toBeNull();
    expect(screen.queryByTestId("agentops-run-resume")).toBeNull();
    expect(screen.getByTestId("agentops-run-stuck-note")).toBeInTheDocument();
  });

  it("renders nothing actionable on a finished run", () => {
    renderControls("finished");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByTestId("agentops-run-stuck-note")).toBeNull();
  });
});
