import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import EnvironmentConnectionsScreen from "#/routes/environment-connections";
import { resetOAuthReceiptGuardForTests } from "#/lib/environment/oauth-receipt-guard";
import { invalidateConnectionCaches } from "#/lib/environment/invalidate-connection-caches";

vi.mock("#/lib/data-platform/client", () => ({
  isSupabaseConfigured: true,
  supabase: null,
}));

const connectionsState = vi.hoisted(() => ({
  data: [] as unknown[],
  isPending: false,
}));

vi.mock("#/hooks/query/use-connections", () => ({
  useConnections: () => connectionsState,
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

function renderScreen(entry = "/environment/connections") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <EnvironmentConnectionsScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(invalidateConnectionCaches).mockClear();
  resetOAuthReceiptGuardForTests();
  connectionsState.data = [];
  connectionsState.isPending = false;
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

  it("disables Connect while the connections list has not resolved its first answer, instead of offering a misleading action on an already-connected provider", async () => {
    // Regression: `connectionFor` can't tell "confirmed disconnected" apart
    // from "connections query hasn't fetched yet" while `data` is still
    // undefined/empty for that reason, so every card briefly looked
    // disconnected -- and clickably so -- on a fresh page load even for
    // providers that are actually already connected.
    connectionsState.isPending = true;

    renderScreen();

    const connectButton = await screen.findByTestId(
      "connector-connect-ollama",
    );
    expect(connectButton).toBeDisabled();
  });
});

describe("Environment connections OAuth receipt", () => {
  it("invalidates connection caches once for an OAuth callback", async () => {
    renderScreen("/environment/connections?connected=github");

    await waitFor(() =>
      expect(invalidateConnectionCaches).toHaveBeenCalledTimes(1),
    );
  });

  it("does not double-fire for a second mount of the same receipt in one page load", async () => {
    // Guards against React 18 StrictMode's double-invoked effect firing the
    // toast/cache-invalidation twice for the exact same OAuth redirect.
    renderScreen("/environment/connections?connected=github");
    await waitFor(() =>
      expect(invalidateConnectionCaches).toHaveBeenCalledTimes(1),
    );

    renderScreen("/environment/connections?connected=github");
    expect(invalidateConnectionCaches).toHaveBeenCalledTimes(1);
  });

  it("still fires for a later, genuinely new page load", async () => {
    renderScreen("/environment/connections?connected=github");
    await waitFor(() =>
      expect(invalidateConnectionCaches).toHaveBeenCalledTimes(1),
    );

    resetOAuthReceiptGuardForTests();
    renderScreen("/environment/connections?connected=github");
    await waitFor(() =>
      expect(invalidateConnectionCaches).toHaveBeenCalledTimes(2),
    );
  });
});
