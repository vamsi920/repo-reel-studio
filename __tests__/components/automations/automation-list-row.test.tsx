import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import AutomationService from "#/api/automation-service/automation-service.api";
import type { DeploymentCapabilities } from "#/manifests/types";
import { AutomationListRow } from "#/components/features/automations/automation-list-row";
import type { Automation } from "#/types/automation";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const navigateMock = vi.fn();
vi.mock("#/context/navigation-context", () => ({
  useNavigation: () => ({ navigate: navigateMock }),
}));

vi.mock("#/hooks/use-has-permission", () => ({
  useHasPermission: () => true,
}));

const automation: Automation = {
  id: "automation-1",
  name: "GitHub PR Reviewer",
  prompt: "Review pull requests.",
  enabled: true,
  trigger: { type: "event" },
  repository: "acme/repo",
  model: "Claude",
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

describe("AutomationListRow", () => {
  it("renders title, pills, and action icons in a table row layout", () => {
    renderWithQueryClient(
      <AutomationListRow
        automation={automation}
        onToggle={vi.fn()}
        onRunNow={vi.fn()}
        onExport={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId("automation-list-row-automation-1"),
    ).toBeInTheDocument();
    expect(screen.getByText("GitHub PR Reviewer")).toBeInTheDocument();
    expect(
      screen.getByTestId("automation-pills-automation-1"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("automation-run-now-automation-1"),
    ).toHaveAttribute("aria-label", "AUTOMATIONS$RUN_NOW");
    expect(screen.getByTestId("automation-run-now-automation-1")).toHaveClass(
      "size-8",
    );
  });

  it("opens the actions menu without triggering row navigation handlers", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(
      <AutomationListRow
        automation={automation}
        onToggle={vi.fn()}
        onRunNow={vi.fn()}
        onExport={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "AUTOMATIONS$ACTIONS_MENU" }),
    );

    expect(screen.getByText("COMMON$VIEW")).toBeInTheDocument();
  });

  it("shows the unsupported-trigger badge for a github event automation", () => {
    const githubAutomation: Automation = {
      ...automation,
      trigger: { type: "event", source: "github" },
    };

    renderWithQueryClient(
      <AutomationListRow
        automation={githubAutomation}
        onToggle={vi.fn()}
        onRunNow={vi.fn()}
        onExport={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByTestId("unsupported-trigger-badge")).toBeInTheDocument();
  });

  it("does not show the unsupported-trigger badge for a schedule automation", () => {
    renderWithQueryClient(
      <AutomationListRow
        automation={{ ...automation, trigger: { type: "cron" } }}
        onToggle={vi.fn()}
        onRunNow={vi.fn()}
        onExport={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(
      screen.queryByTestId("unsupported-trigger-badge"),
    ).not.toBeInTheDocument();
  });

  it("pressing Enter on the Run Now button runs it without also navigating the row away", async () => {
    navigateMock.mockClear();
    const onRunNow = vi.fn();
    const user = userEvent.setup();

    renderWithQueryClient(
      <AutomationListRow
        automation={automation}
        onToggle={vi.fn()}
        onRunNow={onRunNow}
        onExport={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    screen.getByTestId("automation-run-now-automation-1").focus();
    await user.keyboard("{Enter}");

    expect(onRunNow).toHaveBeenCalledWith("automation-1");
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
