import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import AgentOpsRunDetailScreen from "#/routes/agentops-run";
import {
  AgentOpsRequestError,
  AgentOpsUnavailableError,
} from "#/api/agentops-service/agentops-service.api";
import type {
  AgentOpsRun,
  AgentOpsRunDetail,
} from "#/api/agentops-service/agentops-service.types";

const run = vi.hoisted(() => vi.fn());

vi.mock("#/hooks/query/use-agentops", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#/hooks/query/use-agentops")>()),
  useAgentOpsRun: () => run(),
}));

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useParams: () => ({ runId: "does-not-exist" }) };
});

function renderRunDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const ui = () => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AgentOpsRunDetailScreen />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(ui());
  return { ...view, rerender: () => view.rerender(ui()) };
}

const RUN: AgentOpsRun = {
  runId: "run-1",
  workspaceId: "/workspace/project",
  agentName: "agent",
  task: "Refactor the parser",
  status: "waiting_for_confirmation",
  model: "gpt-5",
  phase: "tool_call",
  startedAt: "2026-01-01T00:00:00.000Z",
  endedAt: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
  costUsd: 0.02,
  maxBudgetPerTask: null,
  tokens: {
    prompt: 100,
    completion: 50,
    cacheRead: 0,
    cacheWrite: 0,
    reasoning: 0,
    total: 150,
  },
  toolCallCount: 1,
  llmCallCount: 1,
  errorCount: 0,
  artifacts: [],
};

const RUN_DETAIL: AgentOpsRunDetail = {
  run: RUN,
  spans: [],
  audit: [],
  approvals: [
    {
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
    },
  ],
};

describe("AgentOpsRunDetailScreen", () => {
  it("shows a run-not-found state, not the collector-down card, for a 404", () => {
    run.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new AgentOpsRequestError(
        "/runs/does-not-exist",
        404,
        JSON.stringify({ error: "Unknown run does-not-exist" }),
      ),
    });

    renderRunDetail();

    expect(screen.getByTestId("agentops-run-not-found")).toBeInTheDocument();
    expect(screen.getByText("AGENTOPS$RUN_NOT_FOUND_TITLE")).toBeInTheDocument();
    expect(screen.getByText("does-not-exist")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /AGENTOPS\$RUN_BACK/ })).toHaveAttribute(
      "href",
      "/agentops/live",
    );
    expect(
      screen.queryByTestId("agentops-collector-unavailable"),
    ).not.toBeInTheDocument();
    // The collector is up; the start command must not be offered.
    expect(
      screen.queryByText("node scripts/agentops-server.mjs"),
    ).not.toBeInTheDocument();
  });

  it("still shows the collector-down card when the collector is unreachable", () => {
    run.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new AgentOpsUnavailableError("not reachable"),
    });

    renderRunDetail();

    expect(
      screen.getByTestId("agentops-collector-unavailable"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("agentops-run-not-found"),
    ).not.toBeInTheDocument();
  });

  it("keeps the run detail (and its pending approval form) mounted through a collector outage", () => {
    run.mockReturnValue({
      data: RUN_DETAIL,
      isLoading: false,
      error: null,
    });
    const { rerender } = renderRunDetail();

    expect(screen.getByTestId("agentops-run-detail")).toBeInTheDocument();
    expect(
      screen.getByTestId(`agentops-approval-${RUN_DETAIL.approvals[0].id}`),
    ).toBeInTheDocument();

    // One failed poll: React Query keeps the previous data next to the error.
    run.mockReturnValue({
      data: RUN_DETAIL,
      isLoading: false,
      error: new Error("Failed to fetch"),
    });
    rerender();

    expect(screen.getByTestId("agentops-collector-stale")).toBeInTheDocument();
    expect(
      screen.queryByTestId("agentops-collector-unavailable"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("agentops-run-detail")).toBeInTheDocument();
    expect(
      screen.getByTestId(`agentops-approval-${RUN_DETAIL.approvals[0].id}`),
    ).toBeInTheDocument();
  });
});
