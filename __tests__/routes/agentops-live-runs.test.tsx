import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import AgentOpsLiveRuns from "#/routes/agentops-live-runs";
import type { AgentOpsRun } from "#/api/agentops-service/agentops-service.types";

const runsQuery = vi.hoisted(() => vi.fn());

vi.mock("#/hooks/query/use-agentops", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#/hooks/query/use-agentops")>()),
  useAgentOpsRuns: () => runsQuery(),
}));

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

const loaded = (data: unknown) => ({ data, isLoading: false, error: null });
const failedRefetch = (data: unknown) => ({
  data,
  isLoading: false,
  error: new Error("Failed to fetch"),
});

function renderLiveRuns() {
  // A fresh element each render call: React bails out of re-rendering a
  // subtree when it is handed the very same element object again.
  const ui = () => (
    <MemoryRouter>
      <AgentOpsLiveRuns />
    </MemoryRouter>
  );
  const view = render(ui());
  return { ...view, rerender: () => view.rerender(ui()) };
}

describe("AgentOpsLiveRuns", () => {
  it("shows the collector card when the very first fetch fails", () => {
    runsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed to fetch"),
    });

    renderLiveRuns();

    expect(
      screen.getByTestId("agentops-collector-unavailable"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("agentops-runs-table")).not.toBeInTheDocument();
  });

  it("keeps the live runs table mounted behind a stale banner instead of tearing it down on a failed poll", () => {
    // This tab polls every 3s while someone is watching an agent work, and
    // every Fly deploy restarts the collector for ~30s (AGENTS.md INC-3) —
    // a single failed background poll must not replace a still-running
    // agent's table with the full-page "collector unavailable" card.
    runsQuery.mockReturnValue(loaded([RUN]));
    const { rerender } = renderLiveRuns();

    expect(screen.getByTestId("agentops-runs-table")).toBeInTheDocument();

    runsQuery.mockReturnValue(failedRefetch([RUN]));
    rerender();

    expect(screen.getByTestId("agentops-collector-stale")).toBeInTheDocument();
    expect(screen.getByTestId("agentops-runs-table")).toBeInTheDocument();
    expect(
      screen.queryByTestId("agentops-collector-unavailable"),
    ).not.toBeInTheDocument();

    runsQuery.mockReturnValue(loaded([RUN]));
    rerender();

    expect(
      screen.queryByTestId("agentops-collector-stale"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("agentops-runs-table")).toBeInTheDocument();
  });
});
