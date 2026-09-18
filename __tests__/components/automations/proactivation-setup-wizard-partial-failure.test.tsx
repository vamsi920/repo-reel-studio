import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ProactivationSetupWizard } from "#/components/features/automations/proactivation/proactivation-setup-wizard";
import AutomationService from "#/api/automation-service/automation-service.api";
import { useAutomations } from "#/hooks/query/use-automations";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockUseUserProviders = vi.fn();
vi.mock("#/hooks/use-user-providers", () => ({
  useUserProviders: () => mockUseUserProviders(),
}));

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => ({ backend: { kind: "local" } }),
}));

vi.mock("#/api/git-service/github-connection-flag", () => ({
  isLocalGithubConnected: () => false,
}));

vi.mock("#/hooks/query/use-resolved-workspaces", () => ({
  useResolvedWorkspaces: () => ({ workspaces: [] }),
}));

vi.mock("#/stores/workspace-memory-store", () => ({
  useWorkspaceMemoryStore: (
    selector: (state: { activeWorkspaceId: string | null }) => unknown,
  ) => selector({ activeWorkspaceId: null }),
}));

vi.mock(
  "#/components/features/home/git-repo-dropdown/git-repo-dropdown",
  () => ({
    GitRepoDropdown: () => (
      <div data-testid="git-repo-dropdown">repo dropdown</div>
    ),
  }),
);

vi.mock(
  "#/components/features/home/git-provider-dropdown/git-provider-dropdown",
  () => ({
    GitProviderDropdown: () => (
      <div data-testid="git-provider-dropdown">provider dropdown</div>
    ),
  }),
);

vi.mock("#/api/automation-service/automation-service.api", () => ({
  default: {
    createAutomation: vi.fn(),
    toggleAutomation: vi.fn(),
    getAutomations: vi.fn(),
  },
}));

vi.mock("#/api/git-service/mint-local-github-clone-credential", () => ({
  mintLocalGithubCloneCredential: vi.fn().mockResolvedValue("github.com"),
}));

/** Mounts the real `useAutomations` query alongside the wizard so the
 * automations list has a live observer -- the same as the real Automations
 * page rendering both the list and this wizard together -- so a cache
 * invalidation on failure actually triggers a refetch we can observe. */
function AutomationsListProbe() {
  const { data } = useAutomations();
  return <div data-testid="automations-count">{data?.automations.length ?? "loading"}</div>;
}

function Wizard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <AutomationsListProbe />
      <ProactivationSetupWizard isOpen onClose={vi.fn()} onEnabled={vi.fn()} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockUseUserProviders.mockReturnValue({ providers: ["github"] });
  vi.mocked(AutomationService.createAutomation).mockReset();
  vi.mocked(AutomationService.toggleAutomation).mockReset();
  vi.mocked(AutomationService.getAutomations).mockReset();
});

async function completeWizardThroughReview(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(screen.getByText("AUTOMATIONS$PROACTIVATION_NEXT"));
  const manualRepoInput = await screen.findByTestId(
    "proactivation-manual-repo",
  );
  await user.type(manualRepoInput, "acme/widgets");
  await user.click(screen.getByTestId("proactivation-manual-repo-add"));
  await user.click(screen.getByText("AUTOMATIONS$PROACTIVATION_NEXT"));
  await user.click(screen.getByText("AUTOMATIONS$PROACTIVATION_NEXT"));
  await user.click(screen.getByText("AUTOMATIONS$PROACTIVATION_NEXT"));
  await user.click(screen.getByText("AUTOMATIONS$PROACTIVATION_NEXT"));
}

describe("ProactivationSetupWizard partial creation failure", () => {
  it("invalidates the automations list so an automation created before the failing one still shows up", async () => {
    vi.mocked(AutomationService.getAutomations).mockResolvedValueOnce({
      automations: [],
      total: 0,
    });
    // A second, post-invalidation fetch reflects the one automation that
    // was actually created before the failure below.
    vi.mocked(AutomationService.getAutomations).mockResolvedValue({
      automations: [
        {
          id: "auto-1",
          name: "Proactive Engineering — acme/widgets",
          prompt: "p",
          trigger: { type: "cron", schedule: "0 9 * * *" },
          enabled: true,
          repository: "acme/widgets",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
      total: 1,
    });

    vi.mocked(AutomationService.createAutomation).mockResolvedValue({
      id: "auto-1",
      name: "Proactive Engineering — acme/widgets",
      prompt: "p",
      trigger: { type: "cron", schedule: "0 9 * * *" },
      enabled: true,
      repository: "acme/widgets",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });
    // create succeeds, the follow-up enable toggle fails -- the loop stops
    // here (this is the only selected repo), but the create already landed.
    vi.mocked(AutomationService.toggleAutomation).mockRejectedValue(
      new Error("automation backend unreachable"),
    );

    const user = userEvent.setup();
    render(<Wizard />);

    await waitFor(() => {
      expect(screen.getByTestId("automations-count")).toHaveTextContent("0");
    });

    await completeWizardThroughReview(user);
    await user.click(
      screen.getByText("AUTOMATIONS$PROACTIVATION_ENABLE_SUBMIT"),
    );

    await waitFor(() => {
      expect(AutomationService.toggleAutomation).toHaveBeenCalled();
    });

    // Without the fix, the query cache is never invalidated on failure and
    // this stays "0" -- the created automation is invisible until some
    // unrelated refetch happens, even though it already exists on the
    // backend.
    await waitFor(() => {
      expect(screen.getByTestId("automations-count")).toHaveTextContent("1");
    });
  });
});
