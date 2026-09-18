import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import AgentOpsApprovals from "#/routes/agentops-approvals";
import type { AgentOpsApproval } from "#/api/agentops-service/agentops-service.types";

const approvalsQuery = vi.hoisted(() => vi.fn());

vi.mock("#/hooks/query/use-agentops", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#/hooks/query/use-agentops")>()),
  useAgentOpsApprovals: () => approvalsQuery(),
}));

const APPROVAL: AgentOpsApproval = {
  id: "confirmation:run-1:2026-01-01T00:00:00.000Z",
  kind: "confirmation",
  state: "pending",
  runId: "run-1",
  workspaceId: "/workspace/project",
  agentName: "agent",
  title: "Run a shell command",
  what: "rm -rf build",
  why: "Cleaning the build directory before a fresh build.",
  estimatedCostUsd: 0.02,
  requestedAt: "2026-01-01T00:00:00.000Z",
};

const loaded = (data: unknown) => ({ data, isLoading: false, error: null });
const failedRefetch = (data: unknown) => ({
  data,
  isLoading: false,
  error: new Error("Failed to fetch"),
});

function renderApprovals() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // A fresh element each render call: React bails out of re-rendering a
  // subtree when it is handed the very same element object again.
  const ui = () => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AgentOpsApprovals />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(ui());
  return { ...view, rerender: () => view.rerender(ui()) };
}

const reasonInput = () =>
  screen.getByLabelText("AGENTOPS$APPROVAL_REASON_LABEL");

describe("AgentOpsApprovals", () => {
  it("keeps a half-typed decision reason through a collector outage", async () => {
    approvalsQuery.mockReturnValue(loaded([APPROVAL]));
    const user = userEvent.setup();
    const { rerender } = renderApprovals();

    await user.type(reasonInput(), "looks safe");
    expect(reasonInput()).toHaveValue("looks safe");

    // One failed poll: React Query keeps the previous data next to the error.
    approvalsQuery.mockReturnValue(failedRefetch([APPROVAL]));
    rerender();

    expect(screen.getByTestId("agentops-collector-stale")).toBeInTheDocument();
    expect(
      screen.queryByTestId("agentops-collector-unavailable"),
    ).not.toBeInTheDocument();
    expect(reasonInput()).toHaveValue("looks safe");

    // The next successful poll clears the banner without touching the input.
    approvalsQuery.mockReturnValue(loaded([APPROVAL]));
    rerender();

    expect(
      screen.queryByTestId("agentops-collector-stale"),
    ).not.toBeInTheDocument();
    expect(reasonInput()).toHaveValue("looks safe");
  });

  it("still shows the collector card when the very first fetch fails", () => {
    approvalsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed to fetch"),
    });

    renderApprovals();

    expect(
      screen.getByTestId("agentops-collector-unavailable"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("agentops-approvals-queue"),
    ).not.toBeInTheDocument();
  });
});
