import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import AgentOpsRunDetailScreen from "#/routes/agentops-run";
import {
  AgentOpsRequestError,
  AgentOpsUnavailableError,
} from "#/api/agentops-service/agentops-service.api";

const run = vi.hoisted(() => vi.fn());

vi.mock("#/hooks/query/use-agentops", () => ({
  useAgentOpsRun: () => run(),
}));

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useParams: () => ({ runId: "does-not-exist" }) };
});

function renderRunDetail() {
  return render(<AgentOpsRunDetailScreen />, {
    wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
  });
}

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
});
