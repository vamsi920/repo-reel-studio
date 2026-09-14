import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgentOpsPanel } from "#/components/features/agentops/agentops-panel";

describe("AgentOpsPanel", () => {
  it("shows the collector card when a query fails with nothing to fall back on", () => {
    render(
      <AgentOpsPanel isLoading={false} error={new Error("collector down")}>
        <div data-testid="child" />
      </AgentOpsPanel>,
    );

    expect(
      screen.getByTestId("agentops-collector-unavailable"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
  });

  it("keeps the children mounted behind a banner when the tab still has data", () => {
    // A failed refetch on a tab that already rendered real data must not
    // unmount that tab — Budgets keeps half-typed edits in component state.
    render(
      <AgentOpsPanel
        isLoading={false}
        error={new Error("collector down")}
        hasData
      >
        <div data-testid="child" />
      </AgentOpsPanel>,
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.getByTestId("agentops-collector-stale")).toHaveTextContent(
      "AGENTOPS$COLLECTOR_STALE_BANNER",
    );
    expect(
      screen.queryByTestId("agentops-collector-unavailable"),
    ).not.toBeInTheDocument();
  });

  it("renders the children alone once the query is healthy", () => {
    render(
      <AgentOpsPanel isLoading={false} error={null} hasData>
        <div data-testid="child" />
      </AgentOpsPanel>,
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(
      screen.queryByTestId("agentops-collector-stale"),
    ).not.toBeInTheDocument();
  });
});
