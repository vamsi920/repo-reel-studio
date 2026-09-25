import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RunControls } from "#/components/features/agentops/run-controls";
import AgentOpsService, {
  AgentOpsRequestError,
} from "#/api/agentops-service/agentops-service.api";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import type {
  AgentOpsRun,
  AgentOpsRunStatus,
} from "#/api/agentops-service/agentops-service.types";

vi.mock("#/utils/custom-toast-handlers", () => ({
  displayErrorToast: vi.fn(),
}));

function run(status: AgentOpsRunStatus): AgentOpsRun {
  return {
    runId: "run-1",
    workspaceId: "/workspace/project",
    agentName: "agent",
    task: "Refactor the parser",
    status,
    model: "anthropic/claude",
    phase: "code_edit",
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: null,
    updatedAt: "2026-01-01T00:01:00.000Z",
    costUsd: 0.42,
    maxBudgetPerTask: null,
    tokens: {
      prompt: 1,
      completion: 1,
      cacheRead: 0,
      cacheWrite: 0,
      reasoning: 0,
      total: 2,
    },
    toolCallCount: 3,
    llmCallCount: 2,
    errorCount: 0,
    artifacts: [],
  };
}

function renderControls(status: AgentOpsRunStatus) {
  return render(<RunControls run={run(status)} />, {
    wrapper: ({ children }) => (
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        {children}
      </QueryClientProvider>
    ),
  });
}

describe("RunControls", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(displayErrorToast).mockClear();
  });

  it("calls pause directly, with no confirmation step", async () => {
    const controlRun = vi
      .spyOn(AgentOpsService, "controlRun")
      .mockResolvedValue(undefined);
    renderControls("running");

    await userEvent.click(screen.getByTestId("agentops-run-pause"));

    await waitFor(() =>
      expect(controlRun).toHaveBeenCalledWith("run-1", "pause"),
    );
    expect(screen.queryByTestId("agentops-stop-confirmation")).toBeNull();
  });

  it("asks for confirmation before Stop, and only calls cancel once confirmed", async () => {
    const controlRun = vi
      .spyOn(AgentOpsService, "controlRun")
      .mockResolvedValue(undefined);
    renderControls("running");

    await userEvent.click(screen.getByTestId("agentops-run-stop"));
    expect(
      screen.getByTestId("agentops-stop-confirmation"),
    ).toBeInTheDocument();
    // Nothing is sent to the runtime until the operator actually confirms.
    expect(controlRun).not.toHaveBeenCalled();

    await userEvent.click(screen.getByText("BUTTON$CANCEL"));
    expect(screen.queryByTestId("agentops-stop-confirmation")).toBeNull();
    expect(controlRun).not.toHaveBeenCalled();
  });

  it("sends cancel once Stop is confirmed, and closes the dialog", async () => {
    const controlRun = vi
      .spyOn(AgentOpsService, "controlRun")
      .mockResolvedValue(undefined);
    renderControls("running");

    await userEvent.click(screen.getByTestId("agentops-run-stop"));
    await userEvent.click(
      screen.getByText("AGENTOPS$CONTROL_STOP_CONFIRM_ACTION"),
    );

    await waitFor(() =>
      expect(controlRun).toHaveBeenCalledWith("run-1", "cancel"),
    );
    expect(screen.queryByTestId("agentops-stop-confirmation")).toBeNull();
  });

  it("shows the collector's own refusal reason when a control is rejected", async () => {
    vi.spyOn(AgentOpsService, "controlRun").mockRejectedValue(
      new AgentOpsRequestError(
        "/runs/run-1/pause",
        409,
        JSON.stringify({ error: "This run is already paused." }),
      ),
    );
    renderControls("running");

    await userEvent.click(screen.getByTestId("agentops-run-pause"));

    await waitFor(() =>
      expect(displayErrorToast).toHaveBeenCalledWith(
        "This run is already paused.",
      ),
    );
  });

  it("offers Pause and Stop on a running run", () => {
    renderControls("running");
    expect(screen.getByTestId("agentops-run-pause")).toBeInTheDocument();
    expect(screen.getByTestId("agentops-run-stop")).toBeInTheDocument();
    expect(screen.queryByTestId("agentops-run-resume")).toBeNull();
    expect(screen.queryByTestId("agentops-run-stuck-note")).toBeNull();
  });

  it("explains that Pause waits for the current command to finish", () => {
    renderControls("running");
    expect(screen.getByTestId("agentops-run-pause")).toHaveAttribute(
      "title",
      "AGENTOPS$CONTROL_PAUSE_HINT",
    );
  });

  it("offers only Resume on a paused run", () => {
    // Stop is /interrupt, which the runtime ignores on a paused conversation:
    // the run would stay paused in Live Runs and the collector refuses it
    // with a 409, so the button is not offered at all.
    renderControls("paused");
    expect(screen.getByTestId("agentops-run-resume")).toBeInTheDocument();
    expect(screen.queryByTestId("agentops-run-stop")).toBeNull();
    expect(screen.queryByTestId("agentops-run-pause")).toBeNull();
  });

  it("offers only Resume on an idle run", () => {
    // Stop is /interrupt, which the runtime treats as an idle conversation
    // exactly like Pause (there's no in-flight task to cancel) — the
    // collector refuses it with a 409 rather than misrecording it as
    // "cancelled" when it would really just pause, so the button is not
    // offered.
    renderControls("idle");
    expect(screen.getByTestId("agentops-run-resume")).toBeInTheDocument();
    expect(screen.queryByTestId("agentops-run-stop")).toBeNull();
    expect(screen.queryByTestId("agentops-run-pause")).toBeNull();
  });

  it("renders no controls on a run waiting for confirmation", () => {
    // The runtime ignores /interrupt while a conversation is
    // waiting_for_confirmation (neither idle nor running, so even Pause's
    // fallback does nothing) — approve or reject the pending action in the
    // Approvals queue instead.
    renderControls("waiting_for_confirmation");
    expect(screen.queryByTestId("agentops-run-pause")).toBeNull();
    expect(screen.queryByTestId("agentops-run-stop")).toBeNull();
    expect(screen.queryByTestId("agentops-run-resume")).toBeNull();
  });

  it("renders no controls on a stuck run, only an explanation", () => {
    // The runtime ignores /interrupt on a stuck conversation and /run
    // re-trips the stuck detector immediately, so Pause/Stop/Resume would all
    // be controls that don't act. Say what happened and what to do instead.
    renderControls("stuck");
    expect(screen.queryByTestId("agentops-run-pause")).toBeNull();
    expect(screen.queryByTestId("agentops-run-stop")).toBeNull();
    expect(screen.queryByTestId("agentops-run-resume")).toBeNull();
    expect(screen.getByTestId("agentops-run-stuck-note")).toBeInTheDocument();
  });

  it("offers Resume on an errored run", () => {
    // `run()` in software-agent-sdk restarts an ERROR conversation just like
    // a paused one (see run-control.mjs's evaluateRunControl), so Resume must
    // be offered here too, not just for "paused"/"idle".
    renderControls("error");
    expect(screen.getByTestId("agentops-run-resume")).toBeInTheDocument();
    expect(screen.queryByTestId("agentops-run-pause")).toBeNull();
    expect(screen.queryByTestId("agentops-run-stop")).toBeNull();
  });

  it("renders nothing actionable on a finished run", () => {
    renderControls("finished");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByTestId("agentops-run-stuck-note")).toBeNull();
  });

  it("renders nothing actionable on a cancelled run", () => {
    // Closed out by the collector after its conversation was deleted from
    // the runtime — there is nothing left to pause, stop or resume.
    renderControls("cancelled");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByTestId("agentops-run-stuck-note")).toBeNull();
  });
});
