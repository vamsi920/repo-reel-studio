import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { ProactivationSetupWizard } from "#/components/features/automations/proactivation/proactivation-setup-wizard";

const mockUseUserProviders = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("#/hooks/use-user-providers", () => ({
  useUserProviders: () => mockUseUserProviders(),
}));

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => ({ backend: { kind: "cloud" } }),
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

const queryClient = new QueryClient();

function Wizard() {
  return (
    <QueryClientProvider client={queryClient}>
      <ProactivationSetupWizard isOpen onClose={vi.fn()} onEnabled={vi.fn()} />
    </QueryClientProvider>
  );
}

describe("ProactivationSetupWizard repositories step", () => {
  it("re-syncs selectedProvider once the async provider list resolves, instead of staying stuck with no input", async () => {
    // Mirrors the real flow: useUserProviders resolves providers
    // asynchronously, so the wizard's first render (and the render at the
    // moment the user reaches the repositories step) can see an empty list.
    mockUseUserProviders.mockReturnValue({ providers: [] });

    const user = userEvent.setup();
    const { rerender } = render(<Wizard />);
    await user.click(screen.getByText("AUTOMATIONS$PROACTIVATION_NEXT"));

    // Bug reproduction: with providers still empty, selectedProvider is
    // null and canListRepositories is true, so neither the dropdown nor
    // the manual-entry input renders -- a dead end.
    expect(screen.queryByTestId("git-repo-dropdown")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("proactivation-manual-repo"),
    ).not.toBeInTheDocument();

    // The provider list resolves after mount (e.g. the GitHub connection
    // query finishes) and the component re-renders without remounting.
    mockUseUserProviders.mockReturnValue({ providers: ["github"] });
    rerender(<Wizard />);

    expect(await screen.findByTestId("git-repo-dropdown")).toBeInTheDocument();
  });
});
