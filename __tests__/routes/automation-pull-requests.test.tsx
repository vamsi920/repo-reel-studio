import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "test-utils";
import { I18nKey } from "#/i18n/declaration";
import AutomationPullRequests from "#/routes/automation-pull-requests";
import type { NeodevexPullRequest } from "#/api/git-service/local-github-service.api";

const { listNeodevexPullRequestsMock } = vi.hoisted(() => ({
  listNeodevexPullRequestsMock: vi.fn(),
}));

vi.mock("#/api/git-service/local-github-service.api", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("#/api/git-service/local-github-service.api")
  >()),
  listNeodevexPullRequests: listNeodevexPullRequestsMock,
}));

const useGithubConnectionMock = vi.fn();
vi.mock("#/hooks/query/use-github-connection", () => ({
  useGithubConnection: () => useGithubConnectionMock(),
}));

// A HeroUI Autocomplete is awkward to drive in jsdom; the route's own
// filtering logic is what this suite covers, so the dropdown is replaced
// with a flat list of option buttons (same pattern as language-input.test.tsx).
vi.mock("#/components/features/settings/settings-dropdown-input", () => ({
  SettingsDropdownInput: ({
    testId,
    items,
    onSelectionChange,
  }: {
    testId: string;
    items: { key: React.Key; label: string }[];
    onSelectionChange?: (key: React.Key | null) => void;
  }) => (
    <div data-testid={testId}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          data-testid={`${testId}-option-${item.key}`}
          onClick={() => onSelectionChange?.(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  ),
}));

function makePr(overrides: Partial<NeodevexPullRequest>): NeodevexPullRequest {
  return {
    id: "pr-1",
    number: 1,
    title: "Untitled",
    url: "https://github.com/acme/repo/pull/1",
    repository: "acme/repo",
    branch: "neodevex/knowledge-kt/untitled",
    state: "open",
    isDraft: false,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    mergedAt: null,
    closedAt: null,
    ...overrides,
  };
}

const openPr = makePr({
  id: "pr-open",
  number: 10,
  title: "Add dark mode",
  repository: "acme/repo-a",
  branch: "neodevex/knowledge-kt/add-dark-mode",
  state: "open",
  createdAt: "2026-09-20T00:00:00Z",
});
const mergedPr = makePr({
  id: "pr-merged",
  number: 11,
  title: "Fix flaky test",
  repository: "acme/repo-b",
  branch: "neodevex/proactivation/fix-flaky-test",
  state: "merged",
  createdAt: "2026-09-25T00:00:00Z",
});
const closedPr = makePr({
  id: "pr-closed",
  number: 12,
  title: "Bump deps",
  repository: "acme/repo-a",
  branch: "neodevex/jira-instant-trigger/bump-deps",
  state: "closed",
  createdAt: "2026-09-10T00:00:00Z",
});

function renderRoute() {
  return renderWithProviders(<AutomationPullRequests />);
}

beforeEach(() => {
  listNeodevexPullRequestsMock.mockReset();
  useGithubConnectionMock.mockReset();
});

describe("AutomationPullRequests", () => {
  it("shows the not-connected message and never fetches PRs when GitHub isn't connected", async () => {
    useGithubConnectionMock.mockReturnValue({ data: undefined, isLoading: false });

    renderRoute();

    expect(
      await screen.findByText(I18nKey.AUTOMATIONS$PULL_REQUESTS$NOT_CONNECTED),
    ).toBeInTheDocument();
    expect(listNeodevexPullRequestsMock).not.toHaveBeenCalled();
  });

  it("shows the empty state when connected but no automation has opened a PR yet", async () => {
    useGithubConnectionMock.mockReturnValue({
      data: { id: "conn-1" },
      isLoading: false,
    });
    listNeodevexPullRequestsMock.mockResolvedValue({
      items: [],
      next_page_id: null,
    });

    renderRoute();

    expect(
      await screen.findByText(I18nKey.AUTOMATIONS$PULL_REQUESTS$EMPTY),
    ).toBeInTheDocument();
  });

  it("renders PR rows newest-first with matching stat tile counts", async () => {
    useGithubConnectionMock.mockReturnValue({
      data: { id: "conn-1" },
      isLoading: false,
    });
    listNeodevexPullRequestsMock.mockResolvedValue({
      items: [openPr, mergedPr, closedPr],
      next_page_id: null,
    });

    renderRoute();

    const table = await screen.findByTestId("pull-requests-table");
    const rows = within(table).getAllByRole("row").slice(1); // drop header row
    expect(rows.map((row) => within(row).getByRole("link").textContent)).toEqual(
      [mergedPr.title, openPr.title, closedPr.title],
    );

    const tiles = screen.getByTestId("pull-request-stat-tiles");
    expect(within(tiles).getAllByText("1")).toHaveLength(3); // open, merged, closed each = 1
  });

  it("filters rows by title search", async () => {
    useGithubConnectionMock.mockReturnValue({
      data: { id: "conn-1" },
      isLoading: false,
    });
    listNeodevexPullRequestsMock.mockResolvedValue({
      items: [openPr, mergedPr, closedPr],
      next_page_id: null,
    });
    const user = userEvent.setup();

    renderRoute();
    await screen.findByTestId("pull-requests-table");

    await user.type(
      screen.getByPlaceholderText(I18nKey.AUTOMATIONS$SEARCH_PLACEHOLDER),
      "dark",
    );

    await waitFor(() => {
      expect(screen.getByText(openPr.title)).toBeInTheDocument();
      expect(screen.queryByText(mergedPr.title)).not.toBeInTheDocument();
      expect(screen.queryByText(closedPr.title)).not.toBeInTheDocument();
    });
  });

  it("shows the no-matches state when a status filter excludes every PR", async () => {
    useGithubConnectionMock.mockReturnValue({
      data: { id: "conn-1" },
      isLoading: false,
    });
    listNeodevexPullRequestsMock.mockResolvedValue({
      items: [openPr],
      next_page_id: null,
    });
    const user = userEvent.setup();

    renderRoute();
    await screen.findByTestId("pull-requests-table");

    await user.click(
      screen.getByTestId("pull-requests-status-filter-option-merged"),
    );

    expect(
      await screen.findByText(I18nKey.AUTOMATIONS$PULL_REQUESTS$NO_MATCHES),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("pull-requests-table")).not.toBeInTheDocument();
  });
});
