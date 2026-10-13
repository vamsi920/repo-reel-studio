import { describe, vi, it, expect, beforeEach } from "vitest";
import AutomationService from "#/api/automation-service/automation-service.api";
import type { DeploymentCapabilities } from "#/manifests/types";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { ConfigurationSection } from "#/components/features/automations/detail/configuration-section";
import type { Automation } from "#/types/automation";

const cronAutomation: Automation = {
  id: "auto-1",
  name: "Daily digest",
  prompt: "Summarize PRs",
  trigger: {
    type: "cron",
    schedule: "0 9 * * *",
    schedule_human: "Daily at 09:00",
  },
  enabled: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  model: "fast-model",
  repository: "acme/app",
  branch: "main",
  timezone: "UTC",
};

const eventAutomation: Automation = {
  id: "auto-2",
  name: "PR Review Bot",
  prompt: "Review PRs",
  trigger: {
    type: "event",
    source: "github",
    on: "pull_request.opened",
    filter: "repository.full_name == 'acme/frontend-app'",
  },
  enabled: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  model: "review-model",
  repository: "acme/frontend-app",
  branch: "main",
};

const eventMultiPatternAutomation: Automation = {
  ...eventAutomation,
  id: "auto-3",
  trigger: {
    type: "event",
    source: "github",
    on: ["push", "release.published"],
    filter: "glob(release.tag_name, 'v*')",
  },
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

describe("ConfigurationSection", () => {
  it("renders cron trigger with schedule", () => {
    renderWithQueryClient(<ConfigurationSection automation={cronAutomation} />);

    // t() returns the key in tests
    expect(
      screen.getByText("AUTOMATIONS$DETAIL$TRIGGER_SCHEDULE"),
    ).toBeInTheDocument();
    expect(screen.getByText("Daily at 09:00 (UTC)")).toBeInTheDocument();
    expect(screen.getByText("fast-model")).toBeInTheDocument();
    expect(screen.getByText("acme/app")).toBeInTheDocument();
  });

  it("renders event trigger with source, event type, and filter", () => {
    renderWithQueryClient(
      <ConfigurationSection automation={eventAutomation} />,
    );

    expect(
      screen.getByText("AUTOMATIONS$DETAIL$TRIGGER_EVENT"),
    ).toBeInTheDocument();
    expect(screen.getByText("github")).toBeInTheDocument();
    expect(screen.getByText("pull_request.opened")).toBeInTheDocument();
    expect(
      screen.getByText("repository.full_name == 'acme/frontend-app'"),
    ).toBeInTheDocument();
  });

  it("does not show schedule field for event triggers", () => {
    renderWithQueryClient(
      <ConfigurationSection automation={eventAutomation} />,
    );

    expect(
      screen.queryByText("AUTOMATIONS$DETAIL$SCHEDULE"),
    ).not.toBeInTheDocument();
  });

  it("renders multiple event patterns joined by comma", () => {
    renderWithQueryClient(
      <ConfigurationSection automation={eventMultiPatternAutomation} />,
    );

    expect(screen.getByText("push, release.published")).toBeInTheDocument();
  });

  it("shows expand/collapse for long filter expressions", async () => {
    const longFilter =
      "repository.full_name == 'acme/frontend-app' && contains(pull_request.labels[].name, 'needs-review') && sender.login != 'bot'";
    const automation: Automation = {
      ...eventAutomation,
      trigger: {
        type: "event",
        source: "github",
        on: "pull_request.opened",
        filter: longFilter,
      },
    };

    const user = userEvent.setup();
    renderWithQueryClient(<ConfigurationSection automation={automation} />);

    expect(screen.getByText("SETTINGS$SKILLS_SHOW_MORE")).toBeInTheDocument();
    expect(screen.queryByText(longFilter)).not.toBeInTheDocument();

    await user.click(screen.getByText("SETTINGS$SKILLS_SHOW_MORE"));
    expect(screen.getByText(longFilter)).toBeInTheDocument();
    expect(screen.getByText("SETTINGS$SKILLS_SHOW_LESS")).toBeInTheDocument();
  });

  it("does not render the filter field when the event trigger has no filter", () => {
    const automation: Automation = {
      ...eventAutomation,
      trigger: {
        type: "event",
        source: "github",
        on: "pull_request.opened",
      },
    };

    renderWithQueryClient(<ConfigurationSection automation={automation} />);

    expect(
      screen.queryByText("AUTOMATIONS$DETAIL$EVENT_FILTER"),
    ).not.toBeInTheDocument();
  });

  it("shows the unsupported-trigger warning for a github event automation", () => {
    renderWithQueryClient(
      <ConfigurationSection automation={eventAutomation} />,
    );

    expect(
      screen.getByTestId("unsupported-trigger-warning"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("AUTOMATIONS$UNSUPPORTED_TRIGGER_WARNING"),
    ).toBeInTheDocument();
  });

  it("does not show the unsupported-trigger warning for a cron automation", () => {
    renderWithQueryClient(<ConfigurationSection automation={cronAutomation} />);

    expect(
      screen.queryByTestId("unsupported-trigger-warning"),
    ).not.toBeInTheDocument();
  });
});
