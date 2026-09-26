import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgentOpsStatTiles } from "#/components/features/agentops/agentops-stat-tiles";
import type { AgentOpsSummary } from "#/api/agentops-service/agentops-service.types";

function summary(overrides: Partial<AgentOpsSummary> = {}): AgentOpsSummary {
  return {
    activeAgents: 1,
    activeRuns: 1,
    runsToday: 3,
    waitingForApproval: 0,
    failures: 0,
    tokensToday: 1000,
    costTodayUsd: 1.5,
    runsTodayWithoutReportedCost: 0,
    generatedAt: "2026-01-01T00:00:00.000Z",
    collector: { status: "ok", lastTickAt: null, lastError: null, trackedRuns: 0 },
    store: "supabase",
    ...overrides,
  };
}

describe("AgentOpsStatTiles", () => {
  it("renders every tile's value from the summary with a neutral tone by default", () => {
    render(<AgentOpsStatTiles summary={summary()} />);
    expect(screen.getByText("1")).toBeInTheDocument(); // Active Agents
    expect(screen.getByText("3")).toBeInTheDocument(); // Runs Today
    // Both "waiting for approval" and "failures" render as "0" — no danger
    // or warning color is asserted here, only that nothing crashes on the
    // all-clear case (covered by the tone assertions below).
    expect(screen.getAllByText("0")).toHaveLength(2);
  });

  it("flags a non-zero waiting-for-approval count with the warning tone", () => {
    render(<AgentOpsStatTiles summary={summary({ waitingForApproval: 2 })} />);
    const value = screen.getByText("2");
    // Only the icon wrapper carries an inline `style` (the tone color); the
    // label and value spans are styled entirely through class names.
    const icon = value.parentElement?.querySelector("span[style]");
    expect(icon).toHaveStyle({ color: "var(--warning-500)" });
  });

  it("flags a non-zero failures count with the danger tone", () => {
    render(<AgentOpsStatTiles summary={summary({ failures: 4 })} />);
    const value = screen.getByText("4");
    const icon = value.parentElement?.querySelector("span[style]");
    expect(icon).toHaveStyle({ color: "var(--error-500)" });
  });

  it("calls out runs today whose provider reported no cost, rather than showing them as free", () => {
    render(
      <AgentOpsStatTiles
        summary={summary({ runsTodayWithoutReportedCost: 2 })}
      />,
    );
    // `useTranslation` is mocked (see vitest.setup.ts) to return the key
    // itself, so the note text below is that key rather than real copy.
    expect(screen.getByText("AGENTOPS$NO_REPORTED_COST")).toBeInTheDocument();
  });

  it("omits the no-cost note when every run today reported real cost", () => {
    render(<AgentOpsStatTiles summary={summary()} />);
    expect(
      screen.queryByText("AGENTOPS$NO_REPORTED_COST"),
    ).not.toBeInTheDocument();
  });
});
