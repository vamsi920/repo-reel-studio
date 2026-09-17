import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProactivationSetupWizard } from "#/components/features/automations/proactivation/proactivation-setup-wizard";

const mockUseUserProviders = vi.fn();
const mockUseActiveBackend = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("#/hooks/use-user-providers", () => ({
  useUserProviders: () => mockUseUserProviders(),
}));

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => mockUseActiveBackend(),
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

beforeEach(() => {
  mockUseActiveBackend.mockReturnValue({ backend: { kind: "cloud" } });
});

function Wizard({
  isOpen = true,
  onClose = vi.fn(),
  onEnabled = vi.fn(),
}: {
  isOpen?: boolean;
  onClose?: () => void;
  onEnabled?: () => void;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <ProactivationSetupWizard
        isOpen={isOpen}
        onClose={onClose}
        onEnabled={onEnabled}
      />
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

describe("ProactivationSetupWizard state reset on reopen", () => {
  it("resets step, repo selection, and watch areas when reopened after being cancelled", async () => {
    // The parent always renders this component and only toggles `isOpen`
    // (see ProactivationFeatureCard), so the instance never unmounts on
    // close -- reproduce that by keeping the same tree across rerenders and
    // only flipping the `isOpen` prop.
    mockUseUserProviders.mockReturnValue({ providers: ["github"] });
    mockUseActiveBackend.mockReturnValue({ backend: { kind: "local" } });

    const user = userEvent.setup();
    const { rerender } = render(<Wizard isOpen />);

    // Advance from "workspace" to "repositories" and add a repo manually
    // (canListRepositories is false for a local backend with no GitHub
    // connection, per the mocked isLocalGithubConnected).
    await user.click(screen.getByText("AUTOMATIONS$PROACTIVATION_NEXT"));
    await user.type(
      screen.getByTestId("proactivation-manual-repo"),
      "acme/repo",
    );
    await user.click(screen.getByTestId("proactivation-manual-repo-add"));

    // Advance to "watch" and flip on an area that isn't part of the default
    // selection.
    await user.click(screen.getByText("AUTOMATIONS$PROACTIVATION_NEXT"));
    await user.click(
      screen.getByLabelText("AUTOMATIONS$PROACTIVATION_WATCH_CI"),
    );
    expect(
      screen.getByLabelText("AUTOMATIONS$PROACTIVATION_WATCH_CI"),
    ).toBeChecked();

    // Cancel out without submitting, then reopen.
    rerender(<Wizard isOpen={false} />);
    rerender(<Wizard isOpen />);

    // Back on the first ("workspace") step, not the stale "watch" step.
    expect(
      screen.queryByLabelText("AUTOMATIONS$PROACTIVATION_WATCH_CI"),
    ).not.toBeInTheDocument();

    // The repositories step shows its empty state again -- the manually
    // added repo did not survive the reopen.
    await user.click(screen.getByText("AUTOMATIONS$PROACTIVATION_NEXT"));
    expect(
      screen.getByText("AUTOMATIONS$PROACTIVATION_NO_REPOSITORIES"),
    ).toBeInTheDocument();
  });
});
