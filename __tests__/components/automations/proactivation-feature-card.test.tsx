import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProactivationFeatureCard } from "#/components/features/automations/proactivation/proactivation-feature-card";
import AutomationService from "#/api/automation-service/automation-service.api";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import {
  AutomationRunStatus,
  type Automation,
  type AutomationRun,
} from "#/types/automation";
import { buildProactivationPrompt } from "#/utils/proactivation-prompt";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("#/context/navigation-context", () => ({
  useNavigation: () => ({ navigate: vi.fn() }),
}));

vi.mock("#/api/automation-service/automation-service.api", () => ({
  default: {
    toggleAutomation: vi.fn(),
    dispatchAutomation: vi.fn(),
    getAutomationRuns: vi.fn(),
  },
}));

vi.mock("#/utils/custom-toast-handlers", () => ({
  displaySuccessToast: vi.fn(),
  displayErrorToast: vi.fn(),
}));

const localBackend: Backend = {
  id: "local-1",
  name: "Local 1",
  host: "http://localhost:8000",
  apiKey: "session-key",
  kind: "local",
};

function makeRun(id: string): AutomationRun {
  return {
    id,
    status: AutomationRunStatus.COMPLETED,
    conversation_id: null,
    bash_command_id: null,
    error_detail: null,
    started_at: "2026-01-01T00:00:00Z",
    completed_at: "2026-01-01T00:05:00Z",
  };
}

function makeAutomation(id: string, enabled: boolean): Automation {
  return {
    id,
    name: `Proactive Engineering — acme/${id}`,
    prompt: buildProactivationPrompt({
      watchAreas: ["dependency"],
      autonomyLevel: "recommend",
      repository: `acme/${id}`,
    }),
    trigger: { type: "cron", schedule: "0 9 * * *" },
    enabled,
    repository: `acme/${id}`,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function renderCard(automations: Automation[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveBackendProvider>
        <ProactivationFeatureCard automations={automations} />
      </ActiveBackendProvider>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  setRegisteredBackends([localBackend]);
  setActiveSelection({ backendId: localBackend.id });

  vi.mocked(AutomationService.getAutomationRuns).mockReset();
  vi.mocked(AutomationService.getAutomationRuns).mockResolvedValue({
    runs: [],
    total: 0,
  });
  vi.mocked(AutomationService.toggleAutomation).mockReset();
  vi.mocked(AutomationService.dispatchAutomation).mockReset();

  const { displayErrorToast, displaySuccessToast } = await import(
    "#/utils/custom-toast-handlers"
  );
  vi.mocked(displayErrorToast).mockClear();
  vi.mocked(displaySuccessToast).mockClear();
});

describe("ProactivationFeatureCard last-run timestamp", () => {
  it("shows 'never run' rather than the epoch placeholder when the only run is still pending", async () => {
    // The automation service leaves `started_at` as the epoch placeholder
    // while a run is PENDING and only populates it once execution begins.
    vi.mocked(AutomationService.getAutomationRuns).mockResolvedValue({
      runs: [
        {
          id: "run-1",
          status: AutomationRunStatus.PENDING,
          conversation_id: null,
          bash_command_id: null,
          error_detail: null,
          started_at: "1970-01-01T00:00:00.000Z",
          completed_at: null,
        },
      ],
      total: 1,
    });

    renderCard([makeAutomation("one", true)]);

    await waitFor(() => {
      expect(AutomationService.getAutomationRuns).toHaveBeenCalled();
    });
    expect(
      await screen.findByText(
        /AUTOMATIONS\$PROACTIVATION_NEVER_RUN/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/1970/)).not.toBeInTheDocument();
  });
});

describe("ProactivationFeatureCard pause/resume", () => {
  it("shows an error toast when a toggle call fails, instead of failing silently", async () => {
    // Two enabled automations so Pause fans out two toggle calls on the same
    // shared mutation. The first resolves, the second rejects.
    vi.mocked(AutomationService.toggleAutomation)
      .mockResolvedValueOnce(makeAutomation("one", false))
      .mockRejectedValueOnce(new Error("scheduler offline"));

    const { displayErrorToast } = await import(
      "#/utils/custom-toast-handlers"
    );
    const user = userEvent.setup();
    renderCard([makeAutomation("one", true), makeAutomation("two", true)]);

    await user.click(
      screen.getByText("AUTOMATIONS$PROACTIVATION_PAUSE"),
    );

    await waitFor(() => {
      expect(AutomationService.toggleAutomation).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(displayErrorToast).toHaveBeenCalledWith("scheduler offline");
    });
  });

  it("does not show an error toast when every toggle call succeeds", async () => {
    vi.mocked(AutomationService.toggleAutomation).mockResolvedValue(
      makeAutomation("one", false),
    );

    const { displayErrorToast } = await import(
      "#/utils/custom-toast-handlers"
    );
    const user = userEvent.setup();
    renderCard([makeAutomation("one", true), makeAutomation("two", true)]);

    await user.click(
      screen.getByText("AUTOMATIONS$PROACTIVATION_PAUSE"),
    );

    await waitFor(() => {
      expect(AutomationService.toggleAutomation).toHaveBeenCalledTimes(2);
    });
    expect(displayErrorToast).not.toHaveBeenCalled();
  });
});

describe("ProactivationFeatureCard run all", () => {
  it("shows only a combined partial-failure toast when some dispatches fail and others succeed", async () => {
    vi.mocked(AutomationService.dispatchAutomation)
      .mockResolvedValueOnce(makeRun("run-one"))
      .mockRejectedValueOnce(new Error("scheduler offline"));

    const { displayErrorToast, displaySuccessToast } = await import(
      "#/utils/custom-toast-handlers"
    );
    const user = userEvent.setup();
    renderCard([makeAutomation("one", true), makeAutomation("two", true)]);

    await user.click(screen.getByText("AUTOMATIONS$RUN_NOW"));

    await waitFor(() => {
      expect(AutomationService.dispatchAutomation).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(displayErrorToast).toHaveBeenCalledWith(
        "AUTOMATIONS$RUN_ALL_PARTIAL",
      );
    });
    // Never also claim success -- that reads as a contradiction alongside
    // the failure toast, with no way to tell only some runs started.
    expect(displaySuccessToast).not.toHaveBeenCalled();
  });

  it("shows a plain success toast when every dispatch succeeds", async () => {
    vi.mocked(AutomationService.dispatchAutomation).mockResolvedValue(
      makeRun("run-one"),
    );

    const { displayErrorToast, displaySuccessToast } = await import(
      "#/utils/custom-toast-handlers"
    );
    const user = userEvent.setup();
    renderCard([makeAutomation("one", true), makeAutomation("two", true)]);

    await user.click(screen.getByText("AUTOMATIONS$RUN_NOW"));

    await waitFor(() => {
      expect(AutomationService.dispatchAutomation).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(displaySuccessToast).toHaveBeenCalledWith(
        "AUTOMATIONS$RUN_NOW_SUCCESS",
      );
    });
    expect(displayErrorToast).not.toHaveBeenCalled();
  });

  it("shows the single-failure error toast when every dispatch fails", async () => {
    vi.mocked(AutomationService.dispatchAutomation).mockRejectedValue(
      new Error("scheduler offline"),
    );

    const { displayErrorToast, displaySuccessToast } = await import(
      "#/utils/custom-toast-handlers"
    );
    const user = userEvent.setup();
    renderCard([makeAutomation("one", true), makeAutomation("two", true)]);

    await user.click(screen.getByText("AUTOMATIONS$RUN_NOW"));

    await waitFor(() => {
      expect(AutomationService.dispatchAutomation).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(displayErrorToast).toHaveBeenCalledWith("scheduler offline");
    });
    expect(displaySuccessToast).not.toHaveBeenCalled();
  });
});
