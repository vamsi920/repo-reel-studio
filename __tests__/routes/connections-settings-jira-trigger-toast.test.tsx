import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import toast, { Toaster } from "react-hot-toast";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Unlike the other connections-settings tests, this file does NOT mock
// #/utils/custom-toast-handlers or react-hot-toast: a bug report claimed the
// Jira "Add trigger" form fails completely silently in production (no toast
// at all, despite handleAdd calling displayErrorToast on every failure
// branch). Mocking the toast handler would hide exactly the thing under
// test, so this renders a real <Toaster /> and asserts the toast actually
// lands in the DOM.
const state = vi.hoisted(() => ({
  invoke: vi.fn(),
  createCustomWebhook: vi.fn(),
}));

vi.mock("#/lib/data-platform/client", () => ({
  isSupabaseConfigured: true,
  supabase: { functions: { invoke: state.invoke } },
}));

vi.mock("#/hooks/query/use-github-connection", () => ({
  useGithubConnection: () => ({ data: null, isLoading: false }),
}));

vi.mock("#/hooks/query/use-jira-connection", () => ({
  useJiraConnection: () => ({
    data: { cloudId: "cloud-1", siteUrl: "https://x.atlassian.net" },
    isLoading: false,
  }),
}));

vi.mock("#/hooks/query/use-jira-issues", () => ({
  useJiraIssues: () => ({ data: [] }),
}));

const jiraTriggersRepositoryMock = vi.hoisted(() => ({
  listTriggers: vi.fn().mockResolvedValue([]),
  hasWebhookRegistration: vi.fn().mockResolvedValue(false),
  createTrigger: vi.fn().mockResolvedValue(undefined),
  setEnabled: vi.fn(),
  deleteTrigger: vi.fn(),
}));

vi.mock("#/lib/data-platform/repositories/jira-triggers-repository", () => ({
  jiraTriggersRepository: jiraTriggersRepositoryMock,
}));

vi.mock("#/api/automation-service/automation-service.api", () => ({
  default: {
    createCustomWebhook: state.createCustomWebhook,
    createAutomationDraft: vi.fn().mockResolvedValue({ id: "draft-1" }),
  },
}));

vi.mock("#/lib/environment/invalidate-connection-caches", () => ({
  invalidateConnectionCaches: vi.fn().mockResolvedValue(undefined),
}));

const { ConnectionsSettingsScreen } = await import(
  "#/routes/connections-settings"
);

function renderConnectionsScreen() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <Toaster />
        <ConnectionsSettingsScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function fillAndSubmitTriggerForm() {
  const projectKeyInput = await screen.findByTestId(
    "jira-trigger-project-key",
  );
  const repoInput = screen.getByTestId("jira-trigger-repository");
  await userEvent.type(projectKeyInput, "NEOQA");
  await userEvent.type(repoInput, "vamsi920/neo-qa-fixture");
  await userEvent.click(screen.getByTestId("jira-trigger-add-button"));
}

describe("Jira instant triggers add-trigger toast", () => {
  beforeEach(() => {
    // react-hot-toast's store is a module-level singleton, independent of
    // the React tree -- a toast raised by one test otherwise survives into
    // the next test's freshly-mounted <Toaster />, so two tests asserting
    // the same toast copy (e.g. two different repository-failure paths that
    // both fall back to ERROR$GENERIC) would find more than one match.
    toast.remove();
    state.invoke.mockReset().mockResolvedValue({ error: null });
    state.createCustomWebhook.mockReset().mockResolvedValue({
      id: "webhook-1",
      org_id: "org-1",
      webhook_url: "https://example.com/webhook",
      webhook_secret: "secret",
      signature_header: "X-Signature",
    });
    jiraTriggersRepositoryMock.listTriggers.mockReset().mockResolvedValue([]);
    jiraTriggersRepositoryMock.hasWebhookRegistration
      .mockReset()
      .mockResolvedValue(false);
    jiraTriggersRepositoryMock.createTrigger
      .mockReset()
      .mockResolvedValue({ id: "trigger-1" });
    jiraTriggersRepositoryMock.setEnabled.mockReset().mockResolvedValue(true);
    jiraTriggersRepositoryMock.deleteTrigger
      .mockReset()
      .mockResolvedValue(true);

    // jsdom has no window.matchMedia, and react-hot-toast's <Toaster />
    // reads it unconditionally to check prefers-reduced-motion, so mounting
    // a real Toaster (the whole point of this file) needs it stubbed. Scoped
    // to this file rather than the shared vitest setup: some other test
    // files call vi.resetAllMocks(), which would strip a shared mock's
    // implementation and break unrelated components that also read
    // matchMedia (framer-motion's useReducedMotion, notably).
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  });

  it("surfaces a visible error toast, not a silent failure, when trigger creation fails", async () => {
    state.createCustomWebhook.mockRejectedValue(new Error("409 Conflict"));

    renderConnectionsScreen();
    await fillAndSubmitTriggerForm();

    await waitFor(() => {
      expect(
        screen.queryByText("CONNECTIONS$TRIGGER_CREATE_FAILED"),
      ).not.toBeNull();
    });
    // The form must not silently clear on failure — the user's input stays
    // so they can retry without retyping.
    expect(screen.getByTestId("jira-trigger-project-key")).toHaveValue(
      "NEOQA",
    );
  });

  it("surfaces a visible success toast and clears the form when trigger creation succeeds", async () => {
    renderConnectionsScreen();
    await fillAndSubmitTriggerForm();

    await waitFor(() => {
      expect(screen.queryByText("CONNECTIONS$TRIGGER_CREATED")).not.toBeNull();
    });
    expect(screen.getByTestId("jira-trigger-project-key")).toHaveValue("");
  });

  // Regression: jiraTriggersRepository.createTrigger resolves to `null` on a
  // Supabase query error (RLS denial, etc.) -- it never throws. handleAdd
  // used to await it and show the success toast unconditionally, so a
  // completely un-persisted trigger looked identical to a real one.
  it("surfaces an error toast, not a false success, when the repository write itself fails", async () => {
    jiraTriggersRepositoryMock.createTrigger.mockResolvedValue(null);

    renderConnectionsScreen();
    await fillAndSubmitTriggerForm();

    await waitFor(() => {
      expect(
        screen.queryByText("CONNECTIONS$TRIGGER_CREATE_FAILED"),
      ).not.toBeNull();
    });
    expect(screen.queryByText("CONNECTIONS$TRIGGER_CREATED")).toBeNull();
    // Input stays so the user can retry without retyping.
    expect(screen.getByTestId("jira-trigger-project-key")).toHaveValue(
      "NEOQA",
    );
  });

  // Regression: setEnabled/deleteTrigger resolve to `false` on a Supabase
  // query error rather than throwing, so the old try/catch never saw it and
  // the toggle/delete looked like it silently no-oped.
  it("surfaces an error toast when toggling a trigger fails at the repository", async () => {
    jiraTriggersRepositoryMock.listTriggers.mockResolvedValue([
      {
        id: "trigger-1",
        projectKey: "NEOQA",
        labelFilter: null,
        readyStatus: "Ready for Development",
        repository: "vamsi920/neo-qa-fixture",
        branch: null,
        automationId: "draft-1",
        enabled: false,
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    ]);
    jiraTriggersRepositoryMock.setEnabled.mockResolvedValue(false);

    renderConnectionsScreen();
    const toggleButton = await screen.findByTestId(
      "jira-trigger-toggle-trigger-1",
    );
    await userEvent.click(toggleButton);

    await waitFor(() => {
      expect(screen.queryByText("ERROR$GENERIC")).not.toBeNull();
    });
  });

  it("surfaces an error toast when deleting a trigger fails at the repository", async () => {
    jiraTriggersRepositoryMock.listTriggers.mockResolvedValue([
      {
        id: "trigger-1",
        projectKey: "NEOQA",
        labelFilter: null,
        readyStatus: "Ready for Development",
        repository: "vamsi920/neo-qa-fixture",
        branch: null,
        automationId: "draft-1",
        enabled: true,
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    ]);
    jiraTriggersRepositoryMock.deleteTrigger.mockResolvedValue(false);

    renderConnectionsScreen();
    const deleteButton = await screen.findByTestId(
      "jira-trigger-delete-trigger-1",
    );
    await userEvent.click(deleteButton);

    await waitFor(() => {
      expect(screen.queryByText("ERROR$GENERIC")).not.toBeNull();
    });
  });
});
