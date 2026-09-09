import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { LiveRunsTable } from "#/components/features/agentops/live-runs-table";
import type { AgentOpsRun } from "#/api/agentops-service/agentops-service.types";

const RUN: AgentOpsRun = {
  runId: "run-1",
  workspaceId: "/workspace/project",
  agentName: "agent",
  task: "Refactor the parser",
  status: "running",
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

function renderTable(runs: AgentOpsRun[]) {
  return render(<LiveRunsTable runs={runs} emptyMessage="no runs" />, {
    wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
  });
}

describe("LiveRunsTable", () => {
  it("gives every run a real link, so rows are reachable without a pointer", () => {
    renderTable([RUN]);

    // The row's onClick is pointer-only; without this link a keyboard user
    // cannot open a run at all.
    const link = screen.getByRole("link", { name: "Refactor the parser" });
    expect(link).toHaveAttribute("href", "/agentops/runs/run-1");
  });

  it("renders the empty message instead of a table when there are no runs", () => {
    renderTable([]);

    expect(screen.getByText("no runs")).toBeInTheDocument();
    expect(screen.queryByTestId("agentops-runs-table")).not.toBeInTheDocument();
  });
});
