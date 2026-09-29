import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  invoke: vi.fn(),
  githubConnection: null as { githubUsername: string } | null,
  githubIsError: false,
  githubRefetch: vi.fn(),
  jiraIsError: false,
  jiraRefetch: vi.fn(),
}));

vi.mock("#/lib/data-platform/client", () => ({
  isSupabaseConfigured: true,
  supabase: { functions: { invoke: state.invoke } },
}));

vi.mock("#/hooks/query/use-github-connection", () => ({
  useGithubConnection: () => ({
    data: state.githubConnection,
    isLoading: false,
    isError: state.githubIsError,
    refetch: state.githubRefetch,
  }),
}));

vi.mock("#/hooks/query/use-jira-connection", () => ({
  useJiraConnection: () => ({
    data: null,
    isLoading: false,
    isError: state.jiraIsError,
    refetch: state.jiraRefetch,
  }),
}));

vi.mock("#/hooks/query/use-jira-issues", () => ({
  useJiraIssues: () => ({ data: [] }),
}));

const displayErrorToast = vi.hoisted(() => vi.fn());
const displaySuccessToast = vi.hoisted(() => vi.fn());

vi.mock("#/utils/custom-toast-handlers", () => ({
  displayErrorToast,
  displaySuccessToast,
}));

vi.mock("#/lib/environment/invalidate-connection-caches", () => ({
  invalidateConnectionCaches: vi.fn().mockResolvedValue(undefined),
}));

// Imported after the mocks so the screen picks them up.
const { ConnectionsSettingsScreen } =
  await import("#/routes/connections-settings");

function renderConnectionsScreen() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <ConnectionsSettingsScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ConnectionsSettingsScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.githubConnection = { githubUsername: "octocat" };
    state.githubIsError = false;
    state.jiraIsError = false;
  });

  it("reports a failed GitHub disconnect instead of failing silently", async () => {
    // A network-level failure rejects rather than returning { error }.
    state.invoke.mockRejectedValue(new Error("network down"));

    renderConnectionsScreen();
    await userEvent.click(screen.getByTestId("github-disconnect-button"));

    await waitFor(() => expect(displayErrorToast).toHaveBeenCalled());
    expect(displaySuccessToast).not.toHaveBeenCalled();
    // The button must come back so the user can retry.
    await waitFor(() =>
      expect(screen.getByTestId("github-disconnect-button")).toBeEnabled(),
    );
  });

  it("reports a GitHub disconnect the backend rejected", async () => {
    state.invoke.mockResolvedValue({ error: new Error("nope") });

    renderConnectionsScreen();
    await userEvent.click(screen.getByTestId("github-disconnect-button"));

    await waitFor(() => expect(displayErrorToast).toHaveBeenCalled());
    expect(displaySuccessToast).not.toHaveBeenCalled();
  });

  it("confirms a successful GitHub disconnect", async () => {
    state.invoke.mockResolvedValue({ error: null });

    renderConnectionsScreen();
    await userEvent.click(screen.getByTestId("github-disconnect-button"));

    await waitFor(() => expect(displaySuccessToast).toHaveBeenCalled());
    expect(displayErrorToast).not.toHaveBeenCalled();
  });

  // Regression: an INC-8-style auth-timing glitch during the GitHub
  // connection lookup used to be indistinguishable from "never connected" --
  // the card silently rendered "Not connected" plus a "Connect" button with
  // no signal anything had gone wrong.
  it("shows a retry banner instead of a plain disconnected state when the GitHub lookup itself failed", async () => {
    state.githubConnection = null;
    state.githubIsError = true;

    renderConnectionsScreen();

    expect(screen.getByTestId("connections-github-error")).toBeVisible();
    expect(
      screen.queryByTestId("github-enterprise-toggle"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("connections-github-retry"));
    expect(state.githubRefetch).toHaveBeenCalledTimes(1);
  });

  it("shows a retry banner instead of a plain disconnected state when the Jira lookup itself failed", async () => {
    state.jiraIsError = true;

    renderConnectionsScreen();

    expect(screen.getByTestId("connections-jira-error")).toBeVisible();

    await userEvent.click(screen.getByTestId("connections-jira-retry"));
    expect(state.jiraRefetch).toHaveBeenCalledTimes(1);
  });
});
