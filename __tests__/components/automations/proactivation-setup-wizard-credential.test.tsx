import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ProactivationSetupWizard } from "#/components/features/automations/proactivation/proactivation-setup-wizard";
import AutomationService from "#/api/automation-service/automation-service.api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockUseUserProviders = vi.fn();
vi.mock("#/hooks/use-user-providers", () => ({
  useUserProviders: () => mockUseUserProviders(),
}));

// A local (non-Cloud) backend is the scenario this credential-priming fix
// targets: only a local backend's agent-server has a secret store a
// locally-minted GitHub credential can be written into.
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
  },
}));

const mintLocalGithubCloneCredentialMock = vi.fn();
vi.mock("#/api/git-service/mint-local-github-clone-credential", () => ({
  mintLocalGithubCloneCredential: (
    ...args: Parameters<typeof mintLocalGithubCloneCredentialMock>
  ) => mintLocalGithubCloneCredentialMock(...args),
}));

function Wizard() {
  const queryClient = new QueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <ProactivationSetupWizard isOpen onClose={vi.fn()} onEnabled={vi.fn()} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockUseUserProviders.mockReturnValue({ providers: ["github"] });
  mintLocalGithubCloneCredentialMock.mockReset();
  mintLocalGithubCloneCredentialMock.mockResolvedValue("github.com");
  vi.mocked(AutomationService.createAutomation).mockReset();
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
  vi.mocked(AutomationService.toggleAutomation).mockReset();
  vi.mocked(AutomationService.toggleAutomation).mockResolvedValue({
    id: "auto-1",
    name: "Proactive Engineering — acme/widgets",
    prompt: "p",
    trigger: { type: "cron", schedule: "0 9 * * *" },
    enabled: true,
    repository: "acme/widgets",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  });
});

async function completeWizardThroughReview(
  user: ReturnType<typeof userEvent.setup>,
) {
  // workspace step
  await user.click(screen.getByText("AUTOMATIONS$PROACTIVATION_NEXT"));
  // repositories step: no local GitHub connection and a local backend, so
  // canListRepositories is false and the manual owner/repo input renders.
  const manualRepoInput = await screen.findByTestId("proactivation-manual-repo");
  await user.type(manualRepoInput, "acme/widgets");
  await user.click(screen.getByTestId("proactivation-manual-repo-add"));
  await user.click(screen.getByText("AUTOMATIONS$PROACTIVATION_NEXT"));
  // watch step: default selection is non-empty, so Next is already enabled.
  await user.click(screen.getByText("AUTOMATIONS$PROACTIVATION_NEXT"));
  // autonomy step: default selection.
  await user.click(screen.getByText("AUTOMATIONS$PROACTIVATION_NEXT"));
  // schedule step: default selection.
  await user.click(screen.getByText("AUTOMATIONS$PROACTIVATION_NEXT"));
  // review step.
}

describe("ProactivationSetupWizard credential priming", () => {
  it("mints the local GitHub clone credential for the selected repo's provider before creating the automation, so a private-repo run doesn't fail with no token configured", async () => {
    const user = userEvent.setup();
    render(<Wizard />);

    await completeWizardThroughReview(user);

    const callOrder: string[] = [];
    mintLocalGithubCloneCredentialMock.mockImplementation(async () => {
      callOrder.push("mint");
      return "github.com";
    });
    vi.mocked(AutomationService.createAutomation).mockImplementation(
      async () => {
        callOrder.push("create");
        return {
          id: "auto-1",
          name: "Proactive Engineering — acme/widgets",
          prompt: "p",
          trigger: { type: "cron", schedule: "0 9 * * *" },
          enabled: true,
          repository: "acme/widgets",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        };
      },
    );

    await user.click(
      screen.getByText("AUTOMATIONS$PROACTIVATION_ENABLE_SUBMIT"),
    );

    await waitFor(() => {
      expect(AutomationService.createAutomation).toHaveBeenCalled();
    });

    expect(mintLocalGithubCloneCredentialMock).toHaveBeenCalledWith("github");
    expect(callOrder).toEqual(["mint", "create"]);
  });
});
