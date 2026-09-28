import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import EnvironmentConnectionsScreen from "#/routes/environment-connections";
import { resetOAuthReceiptGuardForTests } from "#/lib/environment/oauth-receipt-guard";
import { invalidateConnectionCaches } from "#/lib/environment/invalidate-connection-caches";
import { EnvironmentService } from "#/api/environment-service/environment-service.api";
import type { ConnectionReceipt } from "#/lib/environment/types/probe";

vi.mock("#/lib/data-platform/client", () => ({
  isSupabaseConfigured: true,
  supabase: null,
}));

const connectionsState = vi.hoisted(() => ({
  data: [] as unknown[],
  isPending: false,
  isOrgError: false,
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

const displayErrorToast = vi.hoisted(() => vi.fn());
const displaySuccessToast = vi.hoisted(() => vi.fn());

vi.mock("#/utils/custom-toast-handlers", () => ({
  displayErrorToast,
  displaySuccessToast,
}));

function ollamaReceipt(probeOk: boolean): ConnectionReceipt {
  return {
    connectionId: "conn-1",
    capability: "llm",
    providerId: "ollama",
    instanceKey: "default",
    status: probeOk ? "ok" : "error",
    fingerprint: "sha256:abcd",
    redacted: {},
    grantedScopes: [],
    missingScopes: [],
    probe: {
      ok: probeOk,
      vantage: "edge",
      latencyMs: 12,
      checks: [],
      probedAt: "2026-09-25T00:00:00.000Z",
    },
  };
}

function renderScreen(entry = "/environment/connections") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[entry]}>
          <EnvironmentConnectionsScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
    queryClient,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(invalidateConnectionCaches).mockClear();
  displayErrorToast.mockClear();
  displaySuccessToast.mockClear();
  resetOAuthReceiptGuardForTests();
  connectionsState.data = [];
  connectionsState.isPending = false;
  connectionsState.isOrgError = false;
});

async function submitOllamaForm() {
  const user = userEvent.setup();
  renderScreen();

  await user.click(await screen.findByTestId("connector-connect-ollama"));
  await user.type(screen.getByTestId("connector-field-model"), "llama3");
  await user.click(screen.getByTestId("connection-submit-ollama"));
  return user;
}

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

describe("Environment connections org resolution failure", () => {
  // Regression (INC-8): a fresh sign-in can hit a transient Supabase
  // auth-timing glitch that makes the org lookup itself fail. Before this,
  // that failure was invisible -- resolveOrgId swallowed it and resolved to
  // `null`, so every provider card rendered a plain "Connect" button
  // indistinguishable from "you have nothing connected here", and confirmed
  // reconnections weren't reflected in the UI either.
  it("renders an honest retry banner instead of a misleading catalog when the org lookup fails", async () => {
    connectionsState.isOrgError = true;

    renderScreen();

    expect(
      await screen.findByTestId("environment-connections-org-error"),
    ).toBeInTheDocument();
  });

  it("does not render the org-error banner once the lookup succeeds", async () => {
    connectionsState.isOrgError = false;

    renderScreen();

    await screen.findByTestId("connector-connect-ollama");
    expect(
      screen.queryByTestId("environment-connections-org-error"),
    ).not.toBeInTheDocument();
  });

  it("retries the org lookup when the banner's retry button is clicked", async () => {
    connectionsState.isOrgError = true;
    const user = userEvent.setup();
    const { queryClient } = renderScreen();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(
      await screen.findByTestId("environment-connections-org-retry"),
    );

    expect(invalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["environment", "org-id"] }),
    );
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

describe("Environment connections credential submit", () => {
  // Regression: the Edge Function always saves the record and always runs a
  // verification probe, but a saved record is not a working one -- the probe
  // fails whenever the credential itself is rejected. Submitting used to
  // ignore that and unconditionally announce "Connection verified" while
  // closing the form, so a bad credential was reported as a success with the
  // real failure visible only in the probe panel underneath.
  it("keeps the form open and reports the failure when the verification probe fails", async () => {
    vi.mocked(EnvironmentService.setCredentials).mockResolvedValue(
      ollamaReceipt(false),
    );

    await submitOllamaForm();

    await waitFor(() => expect(displayErrorToast).toHaveBeenCalledTimes(1));
    expect(displaySuccessToast).not.toHaveBeenCalled();
    expect(screen.getByTestId("connection-form-panel")).toBeInTheDocument();
    await waitFor(() =>
      expect(invalidateConnectionCaches).toHaveBeenCalledTimes(1),
    );
  });

  it("closes the form and reports success once the verification probe passes", async () => {
    vi.mocked(EnvironmentService.setCredentials).mockResolvedValue(
      ollamaReceipt(true),
    );

    await submitOllamaForm();

    await waitFor(() => expect(displaySuccessToast).toHaveBeenCalledTimes(1));
    expect(displayErrorToast).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId("connection-form-panel"),
    ).not.toBeInTheDocument();
  });
});
