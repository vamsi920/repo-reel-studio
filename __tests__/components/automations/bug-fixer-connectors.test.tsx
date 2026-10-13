import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import AutomationService from "#/api/automation-service/automation-service.api";
import type { DeploymentCapabilities } from "#/manifests/types";
import {
  BugFixerConnectors,
  buildAutomationSpec,
} from "#/components/features/automations/bug-fixer-connectors";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("#/context/navigation-context", () => ({
  useNavigation: () => ({ navigate: vi.fn() }),
}));

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => ({ backend: { kind: "local" } }),
}));

vi.mock("#/hooks/use-tracking", () => ({
  useTracking: () => ({ trackAutomationCreatedButton: vi.fn() }),
}));

vi.mock("#/hooks/query/use-automations", () => ({
  useImportAutomation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("#/components/shared/modals/modal-backdrop", () => ({
  ModalBackdrop: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("#/components/shared/modals/modal-close-button", () => ({
  // eslint-disable-next-line i18next/no-literal-string
  ModalCloseButton: () => <button type="button">close</button>,
}));

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

describe("BugFixerConnectors", () => {
  it("warns upfront that the GitHub trigger has no backend receiver yet", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<BugFixerConnectors />);

    await user.click(screen.getByTestId("bug-fixer-connect-github"));

    expect(
      screen.getByTestId("bug-fixer-unsupported-trigger-warning"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("AUTOMATIONS$UNSUPPORTED_TRIGGER_WARNING"),
    ).toBeInTheDocument();
  });

  it("does not show the warning for the Jira connector", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<BugFixerConnectors />);

    await user.click(screen.getByTestId("bug-fixer-connect-jira"));

    expect(
      screen.queryByTestId("bug-fixer-unsupported-trigger-warning"),
    ).not.toBeInTheDocument();
  });
});

describe("buildAutomationSpec", () => {
  it("scopes the GitHub Bug Fixer to its repository", () => {
    expect(buildAutomationSpec("github", "acme/app").trigger).toEqual({
      type: "event",
      source: "github",
      on: ["issues.labeled", "issues.opened"],
      filter: "repository.full_name == 'acme/app'",
    });
  });

  // It listened for "issue.created", which Jira never sends, and cloned the
  // Jira project key as if it were a repository.
  it("triggers the Jira Bug Fixer on Jira's real event for one project and fixes in the GitHub repo", () => {
    const spec = buildAutomationSpec("jira", "acme/app", "proj");

    expect(spec.trigger).toEqual({
      type: "event",
      source: "jira",
      on: ["jira:issue_created"],
      filter: "(issue.fields.project.key || fields.project.key) == 'PROJ'",
    });
    expect(spec.repository).toBe("acme/app");
  });
});
