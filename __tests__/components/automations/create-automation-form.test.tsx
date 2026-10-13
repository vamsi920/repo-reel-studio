import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NavigationProvider } from "#/context/navigation-context";
import { CreateAutomationForm } from "#/components/features/automations/create-automation-form";
import { I18nKey } from "#/i18n/declaration";
import AutomationService from "#/api/automation-service/automation-service.api";

vi.mock("#/hooks/query/use-llm-profiles", () => ({
  useLlmProfiles: () => ({ data: { profiles: [] }, isLoading: false }),
}));

vi.mock("#/hooks/query/use-manifest-capabilities", () => ({
  useDeploymentCapabilities: () => ({ data: undefined }),
}));

const { checkGithubRepository } = vi.hoisted(() => ({
  checkGithubRepository: vi.fn().mockResolvedValue("unknown"),
}));
vi.mock("#/api/git-service/github-credential-health", () => ({
  checkGithubRepository,
  listGithubRepositories: vi.fn().mockResolvedValue([]),
}));

vi.mock("#/utils/custom-toast-handlers", () => ({
  displaySuccessToast: vi.fn(),
  displayErrorToast: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <NavigationProvider
        value={{
          currentPath: "/automations",
          conversationId: null,
          isNavigating: false,
          navigate: vi.fn(),
        }}
      >
        <CreateAutomationForm onCreated={vi.fn()} onCancel={vi.fn()} />
      </NavigationProvider>
    </QueryClientProvider>,
  );
}

describe("CreateAutomationForm validation errors", () => {
  it("clears the name error as soon as a non-empty value is typed", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByTestId("create-automation-submit"));
    expect(
      screen.getByText(I18nKey.AUTOMATIONS$CREATE_NAME_REQUIRED),
    ).toBeInTheDocument();

    await user.type(
      screen.getByTestId("create-automation-name"),
      "My Automation",
    );

    expect(
      screen.queryByText(I18nKey.AUTOMATIONS$CREATE_NAME_REQUIRED),
    ).not.toBeInTheDocument();
  });

  it("clears the instructions error as soon as a non-empty value is typed", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByTestId("create-automation-submit"));
    expect(
      screen.getByText(I18nKey.AUTOMATIONS$CREATE_INSTRUCTIONS_REQUIRED),
    ).toBeInTheDocument();

    await user.type(
      screen.getByTestId("create-automation-prompt"),
      "Do the thing",
    );

    expect(
      screen.queryByText(I18nKey.AUTOMATIONS$CREATE_INSTRUCTIONS_REQUIRED),
    ).not.toBeInTheDocument();
  });
});

describe("CreateAutomationForm GitHub triggers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function fillBasics(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByTestId("create-automation-name"), "Triage");
    await user.type(
      screen.getByTestId("create-automation-prompt"),
      "Triage new issues",
    );
    await user.click(screen.getByTestId("create-automation-run-when-github"));
  }

  it("creates an issue-opened trigger scoped to the repository, with the title condition", async () => {
    const create = vi
      .spyOn(AutomationService, "createAutomationDraft")
      .mockResolvedValue({ id: "a1" } as never);
    const user = userEvent.setup();
    renderForm();

    await fillBasics(user);
    await user.type(
      screen.getByTestId("create-automation-repository"),
      "https://github.com/acme/app",
    );
    await user.type(
      screen.getByTestId("create-automation-github-match"),
      "bug",
    );
    await user.click(screen.getByTestId("create-automation-submit"));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: {
          type: "event",
          source: "github",
          on: "issues.opened",
          filter:
            "repository.full_name == 'acme/app' && (icontains(issue.title, 'bug'))",
        },
      }),
    );
  });

  it("requires a GitHub repository before creating a GitHub-triggered automation", async () => {
    const create = vi.spyOn(AutomationService, "createAutomationDraft");
    const user = userEvent.setup();
    renderForm();

    await fillBasics(user);
    await user.click(screen.getByTestId("create-automation-submit"));

    expect(
      screen.getByText(
        I18nKey.AUTOMATIONS$CREATE_REPOSITORY_REQUIRED_FOR_GITHUB,
      ),
    ).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  // Benchmark A8: an automation for a repository that does not exist was
  // saved and only failed on its first run.
  it("refuses a repository GitHub says does not exist", async () => {
    checkGithubRepository.mockResolvedValueOnce("missing");
    const create = vi.spyOn(AutomationService, "createAutomationDraft");
    const user = userEvent.setup();
    renderForm();

    await fillBasics(user);
    await user.type(
      screen.getByTestId("create-automation-repository"),
      "acme/does-not-exist",
    );
    await user.click(screen.getByTestId("create-automation-submit"));

    expect(
      await screen.findByText(I18nKey.AUTOMATIONS$CREATE_REPOSITORY_NOT_FOUND),
    ).toBeInTheDocument();
    expect(checkGithubRepository).toHaveBeenCalledWith("acme/does-not-exist");
    expect(create).not.toHaveBeenCalled();
  });
});

describe("CreateAutomationForm webhook and schedule time", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("gives a webhook automation its own webhook source and an any-event trigger", async () => {
    const createWebhook = vi
      .spyOn(AutomationService, "createCustomWebhook")
      .mockResolvedValue({
        id: "w1",
        org_id: "o",
        webhook_url: "http://localhost:8000/api/automation/v1/events/o/x",
        webhook_secret: "whsec_test",
        signature_header: "X-Signature-256",
      });
    const create = vi
      .spyOn(AutomationService, "createAutomationDraft")
      .mockResolvedValue({ id: "a1" } as never);
    const user = userEvent.setup();
    renderForm();

    await user.type(
      screen.getByTestId("create-automation-name"),
      "Deploy watch",
    );
    await user.type(screen.getByTestId("create-automation-prompt"), "Look");
    await user.click(screen.getByTestId("create-automation-run-when-webhook"));
    await user.click(screen.getByTestId("create-automation-submit"));

    const source = createWebhook.mock.calls[0][0].source;
    expect(source).toMatch(/^deploy-watch-[a-z0-9]+$/);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: { type: "event", source, on: "*" },
      }),
    );
  });

  it("refuses an empty time instead of silently using 09:00", async () => {
    const create = vi.spyOn(AutomationService, "createAutomationDraft");
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByTestId("create-automation-name"), "Nightly");
    await user.type(screen.getByTestId("create-automation-prompt"), "Run");
    await user.clear(screen.getByTestId("create-automation-time"));
    await user.click(screen.getByTestId("create-automation-submit"));

    expect(
      screen.getByText(I18nKey.AUTOMATIONS$CREATE_TIME_INVALID),
    ).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });
});
