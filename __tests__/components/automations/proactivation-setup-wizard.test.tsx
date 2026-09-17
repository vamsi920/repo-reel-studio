import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ProactivationSetupWizard } from "#/components/features/automations/proactivation/proactivation-setup-wizard";

const mockUseUserProviders = vi.fn();
vi.mock("#/hooks/use-user-providers", () => ({
  useUserProviders: () => mockUseUserProviders(),
}));

const mockUseSupabaseSession = vi.fn();
vi.mock("#/hooks/query/use-supabase-session", () => ({
  useSupabaseSession: () => mockUseSupabaseSession(),
}));

const mockUseGithubConnection = vi.fn();


vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => ({ backend: { kind: "cloud" } }),
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
  beforeEach(() => {
    // Reset mocks for each test in this describe block
    mockUseUserProviders.mockReset();
    mockUseSupabaseSession.mockReset();
    mockUseGithubConnection.mockReset();

    // Default mocks for this suite
    mockUseUserProviders.mockReturnValue({ providers: [] });
    mockUseSupabaseSession.mockReturnValue({ status: "real" });
    mockUseGithubConnection.mockReturnValue({ data: null, isPending: false, fetchStatus: "idle", isError: false });
  });

  it("re-syncs selectedProvider once the async provider list resolves, instead of staying stuck with no input", async () => {
    // Mirrors the real flow: useUserProviders resolves providers
    // asynchronously, so the wizard\'s first render (and the render at the
    // moment the user reaches the repositories step) can see an empty list.
    mockUseUserProviders.mockReturnValueOnce({ providers: [] }); // First render
    mockUseUserProviders.mockReturnValueOnce({ providers: ["github"] }); // After providers resolve

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
    rerender(<Wizard />);
    await waitFor(() => {
      expect(screen.getByTestId("git-repo-dropdown")).toBeInTheDocument();
    });
  });

  it("does not nest the repo picker inside the scrollable step body, so its popover can't be clipped or its click target stolen by the footer", async () => {
    // Regression test: the picker's suggestion popover is positioned with
    // plain `absolute` CSS (no portal). Nesting it inside an
    // `overflow-y-auto` ancestor clips the popover out of paint and
    // hit-testing once it extends past that ancestor, letting the wizard's
    // footer (a later sibling) intercept clicks at the same screen position.
    mockUseUserProviders.mockReturnValue({ providers: ["github"] });

    const user = userEvent.setup();
    render(<Wizard />);
    await user.click(screen.getByText("AUTOMATIONS$PROACTIVATION_NEXT"));

    const dropdown = await screen.findByTestId("git-repo-dropdown");
    let ancestor: HTMLElement | null = dropdown.parentElement;
    while (ancestor) {
      expect(ancestor.className).not.toContain("overflow-y-auto");
      ancestor = ancestor.parentElement;
    }
  });
});

describe("ProactivationSetupWizard local GitHub connection", () => {
  beforeEach(() => {
    // Reset mocks for each test in this describe block
    mockUseUserProviders.mockReset();
    mockUseSupabaseSession.mockReset();
    mockUseGithubConnection.mockReset();

    // Default mocks for this suite
    mockUseUserProviders.mockReturnValue({ providers: ["github"] });
    mockUseSupabaseSession.mockReturnValue({ status: "unauthenticated" });
    mockUseGithubConnection.mockReturnValue({
      data: { githubUsername: "testuser", enterpriseHost: null, connectedAt: "now" },
      isPending: false,
      fetchStatus: "idle",
      isError: false,
    });
  });

  it("renders the GitRepoDropdown when local GitHub is connected, even if Supabase is unauthenticated", async () => {
    const user = userEvent.setup();
    render(<Wizard />);
    await user.click(screen.getByText("AUTOMATIONS$PROACTIVATION_NEXT")); // Navigate to repositories step

    expect(await screen.findByTestId("git-repo-dropdown")).toBeInTheDocument();
  });
});
