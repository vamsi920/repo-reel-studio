import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import EnvironmentConnectionsScreen from "#/routes/environment-connections";

vi.mock("#/lib/data-platform/client", () => ({
  isSupabaseConfigured: true,
  supabase: null,
}));

vi.mock("#/hooks/query/use-connections", () => ({
  useConnections: () => ({ data: [] }),
}));

vi.mock("#/hooks/query/use-environment-profile", () => ({
  useEnvironmentProfile: () => ({ data: null }),
}));

vi.mock("#/lib/environment/invalidate-connection-caches", () => ({
  invalidateConnectionCaches: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("#/api/environment-service/environment-service.api", () => ({
  EnvironmentService: {
    startOAuth: vi.fn(),
    setCredentials: vi.fn(),
    probeConnection: vi.fn(),
    disconnect: vi.fn(),
  },
  EnvironmentServiceError: class EnvironmentServiceError extends Error {},
}));

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/environment/connections"]}>
        <EnvironmentConnectionsScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Environment connections form panel", () => {
  it("scrolls the credential form into view and focuses it when a card is clicked", async () => {
    // The form always renders in a fixed spot near the top of a long,
    // single-scroll catalog page. Without bringing it into view itself,
    // clicking "Connect" on a card further down looked like it did nothing.
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    renderScreen();

    const user = userEvent.setup();
    const connectButton = await screen.findByTestId(
      "connector-connect-ollama",
    );
    await user.click(connectButton);

    const panel = await screen.findByTestId("connection-form-panel");
    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "smooth", block: "start" }),
    );
    await waitFor(() => expect(panel).toHaveFocus());
  });

  it("does not scroll or render a form for an OAuth-only connector", async () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    renderScreen();

    const user = userEvent.setup();
    const connectButton = await screen.findByTestId(
      "connector-connect-github",
    );
    await user.click(connectButton);

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId("connection-form-panel"),
    ).not.toBeInTheDocument();
  });
});
