import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AutomationService from "#/api/automation-service/automation-service.api";
import type { DeploymentCapabilities } from "#/manifests/types";
import { DetailHeader } from "#/components/features/automations/detail/detail-header";
import type { Automation } from "#/types/automation";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockUseHasPermission = vi.hoisted(() => vi.fn(() => true));
vi.mock("#/hooks/use-has-permission", () => ({
  useHasPermission: mockUseHasPermission,
}));

beforeEach(() => {
  mockUseHasPermission.mockReturnValue(true);
});

const baseAutomation: Automation = {
  id: "auto-1",
  name: "GitHub Bug Fixer",
  prompt: null,
  enabled: true,
  trigger: { type: "event", source: "github" },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

// Cards read deployment capabilities through react-query.
function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

// No GitHub receiver is advertised, so github event triggers read as unsupported.
const CAPABILITIES_WITHOUT_GITHUB: DeploymentCapabilities = {
  ready: true,
  triggerKinds: ["cron", "event"],
  eventSources: ["jira"],
  eventTypes: [],
  triggers: {},
  features: [],
};

beforeEach(() => {
  vi.spyOn(AutomationService, "getCapabilities").mockResolvedValue(
    CAPABILITIES_WITHOUT_GITHUB,
  );
});

describe("DetailHeader", () => {
  it("shows the unsupported-trigger badge next to the active status for a github event automation", () => {
    renderWithQueryClient(
      <DetailHeader
        automation={baseAutomation}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onExport={vi.fn()}
        onDownloadTarball={vi.fn()}
      />,
    );

    expect(screen.getByTestId("unsupported-trigger-badge")).toBeInTheDocument();
  });

  it("does not show the unsupported-trigger badge for a schedule automation", () => {
    renderWithQueryClient(
      <DetailHeader
        automation={{ ...baseAutomation, trigger: { type: "cron" } }}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onExport={vi.fn()}
        onDownloadTarball={vi.fn()}
      />,
    );

    expect(
      screen.queryByTestId("unsupported-trigger-badge"),
    ).not.toBeInTheDocument();
  });

  it("still offers Export and Download Tarball to a view-only user, but hides Edit/Toggle/Delete", async () => {
    mockUseHasPermission.mockReturnValue(false);
    const user = userEvent.setup();

    renderWithQueryClient(
      <DetailHeader
        automation={baseAutomation}
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onExport={vi.fn()}
        onDownloadTarball={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "AUTOMATIONS$ACTIONS_MENU" }),
    );

    expect(screen.getByText("AUTOMATIONS$EXPORT")).toBeInTheDocument();
    expect(
      screen.getByText("AUTOMATIONS$DOWNLOAD_TARBALL"),
    ).toBeInTheDocument();
    expect(screen.queryByText("AUTOMATIONS$EDIT")).not.toBeInTheDocument();
    expect(screen.queryByText("AUTOMATIONS$TURN_OFF")).not.toBeInTheDocument();
    expect(screen.queryByText("AUTOMATIONS$DELETE")).not.toBeInTheDocument();
  });
});
