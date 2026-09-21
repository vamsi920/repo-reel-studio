import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentOpsPanel } from "#/components/features/agentops/agentops-panel";

const isAgentOpsSupportedBackend = vi.hoisted(() => vi.fn(() => true));

vi.mock(
  "#/api/agentops-service/agentops-service.api",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("#/api/agentops-service/agentops-service.api")
    >()),
    isAgentOpsSupportedBackend: () => isAgentOpsSupportedBackend(),
  }),
);

describe("AgentOpsPanel", () => {
  beforeEach(() => {
    isAgentOpsSupportedBackend.mockReturnValue(true);
  });

  it("shows the unsupported-backend card for a cloud backend before any query can error", () => {
    // Every AgentOps query hook disables itself for a cloud backend
    // (`enabled: isAgentOpsSupportedBackend()`), so a disabled query's `error`
    // stays `null` forever — without this check every tab silently fell
    // through to its own "nothing here" empty state instead of this card.
    isAgentOpsSupportedBackend.mockReturnValue(false);

    render(
      <AgentOpsPanel isLoading={false} error={null}>
        <div data-testid="child" />
      </AgentOpsPanel>,
    );

    expect(
      screen.getByTestId("agentops-collector-unavailable"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
  });

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
