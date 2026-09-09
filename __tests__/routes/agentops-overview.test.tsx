import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import AgentOpsOverview from "#/routes/agentops-overview";
import type { AgentOpsSummary } from "#/api/agentops-service/agentops-service.types";

const summary = vi.hoisted(() => vi.fn());
const runs = vi.hoisted(() => vi.fn());
const audit = vi.hoisted(() => vi.fn());

vi.mock("#/hooks/query/use-agentops", () => ({
  useAgentOpsSummary: () => summary(),
  useAgentOpsRuns: () => runs(),
  useAgentOpsAudit: () => audit(),
}));

const SUMMARY: AgentOpsSummary = {
  activeAgents: 0,
  activeRuns: 0,
  runsToday: 0,
  waitingForApproval: 0,
  failures: 0,
  tokensToday: 0,
  costTodayUsd: 0,
  runsTodayWithoutReportedCost: 0,
  generatedAt: "2026-01-01T00:00:00.000Z",
  collector: {
    status: "ok",
    lastTickAt: null,
    lastError: null,
    trackedRuns: 0,
  },
};

const loaded = (data: unknown) => ({ data, isLoading: false, error: null });
const loading = { data: undefined, isLoading: true, error: null };

function renderOverview() {
  return render(<AgentOpsOverview />, {
    wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
  });
}

describe("AgentOpsOverview", () => {
  it("waits for every section's query before claiming a section is empty", () => {
    // The summary answering first must not make the still-loading runs and
    // audit sections render "nothing here" — that reads as real telemetry.
    summary.mockReturnValue(loaded(SUMMARY));
    runs.mockReturnValue(loading);
    audit.mockReturnValue(loading);

    renderOverview();

    expect(screen.getByText("AGENTOPS$LOADING")).toBeInTheDocument();
    expect(
      screen.queryByText("AGENTOPS$EMPTY_NO_ACTIVE_RUNS"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("AGENTOPS$EMPTY_NO_AUDIT"),
    ).not.toBeInTheDocument();
  });

  it("surfaces a failure of any one query as the collector being unavailable", () => {
    summary.mockReturnValue(loaded(SUMMARY));
    runs.mockReturnValue(loaded([]));
    audit.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("collector down"),
    });

    renderOverview();

    expect(
      screen.getByTestId("agentops-collector-unavailable"),
    ).toBeInTheDocument();
  });

  it("shows the empty states once everything really has loaded", () => {
    summary.mockReturnValue(loaded(SUMMARY));
    runs.mockReturnValue(loaded([]));
    audit.mockReturnValue(loaded([]));

    renderOverview();

    expect(screen.getByTestId("agentops-stat-tiles")).toBeInTheDocument();
    expect(
      screen.getByText("AGENTOPS$EMPTY_NO_ACTIVE_RUNS"),
    ).toBeInTheDocument();
    expect(screen.getByText("AGENTOPS$EMPTY_NO_AUDIT")).toBeInTheDocument();
  });
});
