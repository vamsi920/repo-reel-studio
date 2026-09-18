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
import type { Automation } from "#/types/automation";
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

  const { displayErrorToast, displaySuccessToast } = await import(
    "#/utils/custom-toast-handlers"
  );
  vi.mocked(displayErrorToast).mockClear();
  vi.mocked(displaySuccessToast).mockClear();
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
