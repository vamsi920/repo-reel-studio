import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApprovalsQueue } from "#/components/features/agentops/approvals-queue";
import AgentOpsService from "#/api/agentops-service/agentops-service.api";
import type { AgentOpsApproval } from "#/api/agentops-service/agentops-service.types";

function budgetApproval(
  overrides: Partial<AgentOpsApproval> = {},
): AgentOpsApproval {
  return {
    id: "budget:run-1:2026-01-01T00:00:00.000Z",
    kind: "budget",
    state: "pending",
    runId: "run-1",
    workspaceId: "/workspace/project",
    agentName: "agent",
    title: "Budget exceeded — refactor the parser",
    what: "Run reached its $2.00 budget (spent $2.0100).",
    why: "run budget of $2.00 reached ($2.0100 spent).",
    estimatedCostUsd: 2.01,
    requestedAt: "2026-01-01T00:00:00.000Z",
    breaches: [
      {
        scope: "run",
        limitUsd: 2,
        usedUsd: 2.01,
        message: "Run reached its $2.00 budget (spent $2.0100).",
      },
    ],
    ...overrides,
  };
}

function renderQueue(approvals: AgentOpsApproval[]) {
  return render(<ApprovalsQueue approvals={approvals} emptyMessage="empty" />, {
    wrapper: ({ children }) => (
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    ),
  });
}

describe("ApprovalsQueue budget approvals", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends positive headroom so the collector does not re-breach immediately", async () => {
    // The collector sets the new limit to usedUsd + additionalBudgetUsd and
    // breaches on >=, so approving with 0 headroom halts the run again on the
    // next tick. The default is one more budget's worth.
    const decide = vi
      .spyOn(AgentOpsService, "decideApproval")
      .mockResolvedValue(undefined);
    const approval = budgetApproval();

    renderQueue([approval]);

    await userEvent.click(
      screen.getByTestId(`agentops-approve-${approval.id}`),
    );

    await waitFor(() =>
      expect(decide).toHaveBeenCalledWith(approval.id, "approve", {
        reason: undefined,
        additionalBudgetUsd: 2,
      }),
    );
  });

  it("blocks approval when the operator clears the headroom", async () => {
    const decide = vi
      .spyOn(AgentOpsService, "decideApproval")
      .mockResolvedValue(undefined);
    const approval = budgetApproval();

    renderQueue([approval]);

    await userEvent.clear(
      screen.getByTestId(`agentops-headroom-${approval.id}`),
    );

    expect(
      screen.getByText("AGENTOPS$APPROVAL_HEADROOM_REQUIRED"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(`agentops-approve-${approval.id}`),
    ).toBeDisabled();
    expect(decide).not.toHaveBeenCalled();
  });

  it("rejects a budget approval without sending any budget change", async () => {
    const decide = vi
      .spyOn(AgentOpsService, "decideApproval")
      .mockResolvedValue(undefined);
    const approval = budgetApproval();

    renderQueue([approval]);

    await userEvent.click(screen.getByTestId(`agentops-reject-${approval.id}`));

    await waitFor(() =>
      expect(decide).toHaveBeenCalledWith(approval.id, "reject", {
        reason: undefined,
        additionalBudgetUsd: undefined,
      }),
    );
  });

  it("does not ask for headroom on a confirmation approval", () => {
    const approval = budgetApproval({
      id: "confirm-1",
      kind: "confirmation",
      breaches: undefined,
    });

    renderQueue([approval]);

    expect(
      screen.queryByTestId(`agentops-headroom-${approval.id}`),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId(`agentops-approve-${approval.id}`),
    ).not.toBeDisabled();
  });
});
