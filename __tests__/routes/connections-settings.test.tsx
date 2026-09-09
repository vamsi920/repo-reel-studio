import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  invoke: vi.fn(),
  githubConnection: null as { githubUsername: string } | null,
}));

vi.mock("#/lib/data-platform/client", () => ({
  isSupabaseConfigured: true,
  supabase: { functions: { invoke: state.invoke } },
}));

vi.mock("#/hooks/query/use-github-connection", () => ({
  useGithubConnection: () => ({
    data: state.githubConnection,
    isLoading: false,
  }),
}));

vi.mock("#/hooks/query/use-jira-connection", () => ({
  useJiraConnection: () => ({ data: null, isLoading: false }),
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
        <ConnectionsSettingsScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ConnectionsSettingsScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.githubConnection = { githubUsername: "octocat" };
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
});
