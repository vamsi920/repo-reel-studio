import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AgentOpsBudgets from "#/routes/agentops-budgets";
import type {
  AgentOpsBudget,
  AgentOpsPolicies,
  AgentOpsWorkspacePolicy,
} from "#/api/agentops-service/agentops-service.types";

const budgetsQuery = vi.hoisted(() => vi.fn());
const policiesQuery = vi.hoisted(() => vi.fn());

vi.mock("#/hooks/query/use-agentops", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#/hooks/query/use-agentops")>()),
  useAgentOpsBudgets: () => budgetsQuery(),
  useAgentOpsPolicies: () => policiesQuery(),
}));

vi.mock("#/utils/custom-toast-handlers", () => ({
  displaySuccessToast: vi.fn(),
  displayErrorToast: vi.fn(),
}));

const WORKSPACE = "/workspace/project";

const WORKSPACE_POLICY: AgentOpsWorkspacePolicy = {
  monthlyBudgetUsd: 20,
  runBudgetUsd: null,
  agentBudgetUsd: null,
  warnThresholdPct: [50, 80, 100],
  allowedTools: null,
  autonomyLevel: "assisted",
  approvalThresholds: { securityRisk: "HIGH", costUsd: null },
};

const POLICIES: AgentOpsPolicies = {
  workspaces: { [WORKSPACE]: WORKSPACE_POLICY },
  agents: {},
};

const BUDGETS: {
  budgets: AgentOpsBudget[];
  agents: AgentOpsPolicies["agents"];
} = {
  budgets: [
    {
      workspaceId: WORKSPACE,
      policy: WORKSPACE_POLICY,
      periodStart: "2026-01-01T00:00:00.000Z",
      usedUsd: 5,
      remainingUsd: 15,
      projectedUsd: 12,
      runCount: 3,
      runsWithoutReportedCost: 0,
      tokens: 1000,
    },
  ],
  agents: {},
};

const loaded = (data: unknown) => ({ data, isLoading: false, error: null });
const failedRefetch = (data: unknown) => ({
  data,
  isLoading: false,
  error: new Error("Failed to fetch"),
});

function renderBudgets() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // A fresh element each time: React bails out of re-rendering a subtree
  // when it is handed the very same element object again.
  const ui = () => (
    <QueryClientProvider client={queryClient}>
      <AgentOpsBudgets />
    </QueryClientProvider>
  );
  const view = render(ui());
  return { ...view, rerender: () => view.rerender(ui()) };
}

const monthlyInput = () =>
  screen.getByTestId(`agentops-budget-monthly-${WORKSPACE}`);

describe("AgentOpsBudgets", () => {
  beforeEach(() => {
    budgetsQuery.mockReturnValue(loaded(BUDGETS));
    policiesQuery.mockReturnValue(loaded(POLICIES));
  });

  it("keeps a half-typed edit through a collector outage and its recovery", async () => {
    const user = userEvent.setup();
    const { rerender } = renderBudgets();

    await user.clear(monthlyInput());
    await user.type(monthlyInput(), "12");
    expect(monthlyInput()).toHaveValue("12");

    // One failed poll: React Query keeps the previous data next to the error.
    budgetsQuery.mockReturnValue(failedRefetch(BUDGETS));
    policiesQuery.mockReturnValue(failedRefetch(POLICIES));
    rerender();

    expect(screen.getByTestId("agentops-collector-stale")).toBeInTheDocument();
    expect(
      screen.queryByTestId("agentops-collector-unavailable"),
    ).not.toBeInTheDocument();
    expect(monthlyInput()).toHaveValue("12");
    expect(screen.getByTestId("agentops-save-policies")).toBeEnabled();

    // The next successful poll clears the banner without touching the edit.
    budgetsQuery.mockReturnValue(loaded(BUDGETS));
    policiesQuery.mockReturnValue(loaded(POLICIES));
    rerender();

    expect(
      screen.queryByTestId("agentops-collector-stale"),
    ).not.toBeInTheDocument();
    expect(monthlyInput()).toHaveValue("12");
    expect(screen.getByTestId("agentops-save-policies")).toBeEnabled();
  });

  it("still shows the collector card when the very first fetch fails", () => {
    budgetsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed to fetch"),
    });
    policiesQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed to fetch"),
    });

    renderBudgets();

    expect(
      screen.getByTestId("agentops-collector-unavailable"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("agentops-budgets-panel"),
    ).not.toBeInTheDocument();
  });
});
