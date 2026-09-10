import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BudgetsPanel,
  parseBudgetUsd,
} from "#/components/features/agentops/budgets-panel";
import AgentOpsService from "#/api/agentops-service/agentops-service.api";
import { AGENTOPS_QUERY_KEYS } from "#/hooks/query/use-agentops";
import type {
  AgentOpsBudget,
  AgentOpsPolicies,
  AgentOpsWorkspacePolicy,
} from "#/api/agentops-service/agentops-service.types";

vi.mock("#/utils/custom-toast-handlers", () => ({
  displaySuccessToast: vi.fn(),
  displayErrorToast: vi.fn(),
}));

const WORKSPACE = "/workspace/project";

function policy(
  overrides: Partial<AgentOpsWorkspacePolicy> = {},
): AgentOpsWorkspacePolicy {
  return {
    monthlyBudgetUsd: 20,
    runBudgetUsd: null,
    agentBudgetUsd: null,
    warnThresholdPct: [50, 80, 100],
    allowedTools: null,
    autonomyLevel: "assisted",
    approvalThresholds: { securityRisk: "HIGH", costUsd: null },
    ...overrides,
  };
}

function budget(overrides: Partial<AgentOpsBudget> = {}): AgentOpsBudget {
  return {
    workspaceId: WORKSPACE,
    policy: policy(),
    periodStart: "2026-01-01T00:00:00.000Z",
    usedUsd: 5,
    remainingUsd: 15,
    projectedUsd: 12,
    runCount: 3,
    runsWithoutReportedCost: 0,
    tokens: 1000,
    ...overrides,
  };
}

const EMPTY_POLICIES: AgentOpsPolicies = { workspaces: {}, agents: {} };

function renderPanel(
  budgets: AgentOpsBudget[],
  policies: AgentOpsPolicies = EMPTY_POLICIES,
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
) {
  const view = render(
    <QueryClientProvider client={queryClient}>
      <BudgetsPanel budgets={budgets} policies={policies} />
    </QueryClientProvider>,
  );
  const rerender = (next: AgentOpsBudget[]) =>
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <BudgetsPanel budgets={next} policies={policies} />
      </QueryClientProvider>,
    );
  return { ...view, rerender, queryClient };
}

const monthlyInput = () =>
  screen.getByTestId(`agentops-budget-monthly-${WORKSPACE}`);
const runInput = () => screen.getByTestId(`agentops-budget-run-${WORKSPACE}`);
const saveButton = () => screen.getByTestId("agentops-save-policies");

describe("parseBudgetUsd", () => {
  it("treats blank as no limit and rejects anything that is not a non-negative number", () => {
    expect(parseBudgetUsd("")).toBeNull();
    expect(parseBudgetUsd("   ")).toBeNull();
    expect(parseBudgetUsd("12.5")).toBe(12.5);
    expect(parseBudgetUsd("0")).toBe(0);
    expect(parseBudgetUsd("-1")).toBeUndefined();
    expect(parseBudgetUsd("50$")).toBeUndefined();
    expect(parseBudgetUsd("abc")).toBeUndefined();
  });
});

describe("BudgetsPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the operator's unsaved edits when the server copy refreshes underneath", async () => {
    const { rerender } = renderPanel([budget()]);

    await userEvent.clear(monthlyInput());
    await userEvent.type(monthlyInput(), "40");
    expect(monthlyInput()).toHaveValue("40");

    // A refetch (30s poll, or any AgentOps mutation invalidating the cache)
    // hands the panel a fresh budgets array with the same policy.
    rerender([budget({ usedUsd: 6, remainingUsd: 14 })]);

    expect(monthlyInput()).toHaveValue("40");
    expect(saveButton()).not.toBeDisabled();
  });

  it("saves exactly what the inputs show, only for the workspaces that changed", async () => {
    const save = vi
      .spyOn(AgentOpsService, "savePolicies")
      .mockImplementation(async (policies) => policies);
    const other = budget({
      workspaceId: "/workspace/other",
      policy: policy({ monthlyBudgetUsd: null, autonomyLevel: "autonomous" }),
    });
    renderPanel([budget(), other], {
      workspaces: { [WORKSPACE]: { warnThresholdPct: [90] } },
      agents: { bot: { agentBudgetUsd: 3 } },
    });

    await userEvent.clear(monthlyInput());
    await userEvent.type(monthlyInput(), "40");
    await userEvent.type(runInput(), "2.5");
    await userEvent.selectOptions(
      screen.getByTestId(`agentops-budget-autonomy-${WORKSPACE}`),
      "supervised",
    );
    await userEvent.click(saveButton());

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith({
      workspaces: {
        [WORKSPACE]: {
          warnThresholdPct: [90],
          monthlyBudgetUsd: 40,
          runBudgetUsd: 2.5,
          autonomyLevel: "supervised",
        },
      },
      agents: { bot: { agentBudgetUsd: 3 } },
    });
  });

  it("refuses to save an amount it cannot parse instead of lifting the limit", async () => {
    const save = vi.spyOn(AgentOpsService, "savePolicies");
    renderPanel([budget()]);

    await userEvent.clear(monthlyInput());
    await userEvent.type(monthlyInput(), "50$");

    expect(monthlyInput()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "AGENTOPS$BUDGET_INVALID_AMOUNT",
    );
    expect(saveButton()).toBeDisabled();

    await userEvent.click(saveButton());
    expect(save).not.toHaveBeenCalled();
  });

  it("clears a limit when the field is blanked", async () => {
    const save = vi
      .spyOn(AgentOpsService, "savePolicies")
      .mockImplementation(async (policies) => policies);
    renderPanel([budget()]);

    await userEvent.clear(monthlyInput());
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    await userEvent.click(saveButton());

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].workspaces[WORKSPACE]).toMatchObject({
      monthlyBudgetUsd: null,
    });
  });

  it("has nothing to save until something differs from the server copy", async () => {
    renderPanel([budget()]);
    expect(saveButton()).toBeDisabled();

    await userEvent.clear(monthlyInput());
    await userEvent.type(monthlyInput(), "25");
    expect(saveButton()).not.toBeDisabled();

    // Typing the original value back means there is no change to save.
    await userEvent.clear(monthlyInput());
    await userEvent.type(monthlyInput(), "20");
    expect(saveButton()).toBeDisabled();
  });

  it("shows the saved limits after a successful save without waiting for the refetch", async () => {
    vi.spyOn(AgentOpsService, "savePolicies").mockImplementation(
      async (policies) => policies,
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(AGENTOPS_QUERY_KEYS.budgets, {
      budgets: [budget()],
      agents: {},
    });
    const { rerender } = renderPanel([budget()], EMPTY_POLICIES, queryClient);

    await userEvent.clear(monthlyInput());
    await userEvent.type(monthlyInput(), "40");
    await userEvent.click(saveButton());

    await waitFor(() => expect(saveButton()).toBeDisabled());
    const cached = queryClient.getQueryData<{ budgets: AgentOpsBudget[] }>(
      AGENTOPS_QUERY_KEYS.budgets,
    );
    expect(cached?.budgets[0].policy.monthlyBudgetUsd).toBe(40);

    // The route re-renders from that patched cache; the form must agree.
    rerender(cached!.budgets);
    expect(monthlyInput()).toHaveValue("40");
    expect(saveButton()).toBeDisabled();
  });

  it("exposes the usage bar as a progress indicator", () => {
    renderPanel([budget({ usedUsd: 5 })]);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "25");
  });
});
