import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { LimitsSection } from "#/components/features/automations/detail/limits-section";
import { AutomationAlertsModal } from "#/components/features/automations/automation-alerts-modal";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import AutomationPolicyService from "#/api/automation-policy-service";
import AutomationService from "#/api/automation-service/automation-service.api";
import { I18nKey } from "#/i18n/declaration";
import { AutomationRunStatus } from "#/types/automation";

vi.mock("#/api/automation-policy-service", () => ({
  default: {
    get: vi.fn(),
    savePolicy: vi.fn().mockResolvedValue(undefined),
    saveAlerts: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("#/api/automation-service/automation-service.api", () => ({
  default: { getAutomationRuns: vi.fn() },
}));

vi.mock("#/utils/custom-toast-handlers", () => ({
  displayErrorToast: vi.fn(),
  displaySuccessToast: vi.fn(),
}));

function renderWithBackend(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveBackendProvider>{ui}</ActiveBackendProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  __resetActiveStoreForTests();
  setRegisteredBackends([
    {
      id: "local-1",
      name: "Local",
      host: "http://localhost:8000",
      apiKey: "k",
      kind: "local",
    },
  ]);
  setActiveSelection({ backendId: "local-1" });
  vi.mocked(AutomationService.getAutomationRuns).mockResolvedValue({
    runs: [
      {
        id: "r1",
        status: AutomationRunStatus.COMPLETED,
        conversation_id: null,
        bash_command_id: null,
        error_detail: null,
        cost: 0.42,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      },
    ],
    total: 1,
  });
});

afterEach(() => {
  __resetActiveStoreForTests();
  vi.clearAllMocks();
});

describe("LimitsSection", () => {
  it("loads the saved limits, shows 24 h spend and the guard's pause reason", async () => {
    vi.mocked(AutomationPolicyService.get).mockResolvedValue({
      policies: { automations: { a1: { daily_budget_usd: 2 } } },
      guard: {
        paused: {
          a1: {
            reason: "budget",
            at: "",
            until: null,
            spent_usd: 2.1,
            budget_usd: 2,
          },
        },
      },
    });

    renderWithBackend(<LimitsSection automationId="a1" />);

    await waitFor(() =>
      expect(screen.getByTestId("automation-limits-budget")).toHaveValue(2),
    );
    expect(screen.getByTestId("automation-limits-paused")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("automation-limits-spent")).toHaveTextContent(
        I18nKey.AUTOMATIONS$LIMITS$SPENT,
      ),
    );
  });

  it("saves the limits the user sets and rejects an invalid hourly limit", async () => {
    const user = userEvent.setup();
    vi.mocked(AutomationPolicyService.get).mockResolvedValue({
      policies: {},
      guard: {},
    });
    renderWithBackend(<LimitsSection automationId="a1" />);
    const perHour = await screen.findByTestId("automation-limits-per-hour");

    await user.type(perHour, "0");
    await user.click(screen.getByTestId("automation-limits-save"));
    expect(
      await screen.findByText(I18nKey.AUTOMATIONS$LIMITS$INVALID_RATE),
    ).toBeInTheDocument();
    expect(AutomationPolicyService.savePolicy).not.toHaveBeenCalled();

    await user.clear(perHour);
    await user.type(perHour, "4");
    await user.type(screen.getByTestId("automation-limits-budget"), "5");
    await user.click(
      screen.getByRole("switch", {
        name: I18nKey.AUTOMATIONS$LIMITS$OVERLAP_LABEL,
      }),
    );
    await user.click(screen.getByTestId("automation-limits-save"));

    await waitFor(() =>
      expect(AutomationPolicyService.savePolicy).toHaveBeenCalledWith("a1", {
        daily_budget_usd: 5,
        max_runs_per_hour: 4,
        skip_overlapping_runs: true,
      }),
    );
  });
});

describe("AutomationAlertsModal", () => {
  it("saves where alerts go and refuses a non-https webhook", async () => {
    const user = userEvent.setup();
    vi.mocked(AutomationPolicyService.get).mockResolvedValue({
      policies: { alerts: { on: "failures", desktop: true } },
      guard: {},
    });
    const onClose = vi.fn();
    renderWithBackend(<AutomationAlertsModal isOpen onClose={onClose} />);
    const webhook = await screen.findByTestId("automation-alerts-webhook");

    await user.type(webhook, "http://insecure.example");
    await user.click(screen.getByTestId("automation-alerts-save"));
    expect(
      await screen.findByText(I18nKey.AUTOMATIONS$ALERTS$INVALID_WEBHOOK),
    ).toBeInTheDocument();

    await user.clear(webhook);
    await user.type(webhook, "https://hooks.slack.com/services/T/B/x");
    await user.click(screen.getByTestId("automation-alerts-mode-all"));
    await user.click(screen.getByTestId("automation-alerts-save"));

    await waitFor(() =>
      expect(AutomationPolicyService.saveAlerts).toHaveBeenCalledWith({
        on: "all",
        desktop: true,
        webhook_url: "https://hooks.slack.com/services/T/B/x",
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });
});
