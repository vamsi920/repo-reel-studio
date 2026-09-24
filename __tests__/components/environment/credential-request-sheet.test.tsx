import type React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CredentialRequestSheet } from "#/components/features/environment/copilot/credential-request-sheet";
import { useOnboardingStudioStore } from "#/stores/onboarding-studio-store";
import type { PendingCredentialRequest } from "#/stores/onboarding-copilot-store";
import { ONBOARDING_RESULT_PREFIX } from "#/constants/onboarding-control";
import { EnvironmentService } from "#/api/environment-service/environment-service.api";
import type { ConnectionReceipt } from "#/lib/environment/types/probe";
import type { ConnectionRecord } from "#/lib/data-platform/repositories/connections-repository";

vi.mock("#/api/environment-service/environment-service.api", async () => {
  const actual = await vi.importActual<
    typeof import("#/api/environment-service/environment-service.api")
  >("#/api/environment-service/environment-service.api");
  return {
    ...actual,
    EnvironmentService: { setCredentials: vi.fn(), startOAuth: vi.fn() },
  };
});

vi.mock("#/utils/custom-toast-handlers", () => ({
  displayErrorToast: vi.fn(),
  displaySuccessToast: vi.fn(),
}));

let mockConnections: ConnectionRecord[] = [];

vi.mock("#/hooks/query/use-connections", () => ({
  useConnections: () => ({ data: mockConnections }),
}));

function renderSheet(props: React.ComponentProps<typeof CredentialRequestSheet>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CredentialRequestSheet {...props} />
    </QueryClientProvider>,
  );
}

const POSTHOG_REQUEST: PendingCredentialRequest = {
  requestId: "posthog:default",
  capability: "observability",
  providerId: "posthog",
  instanceKey: "default",
  fields: ["projectApiKey"],
};

// `github`'s manifest has `oauth` set and zero credential fields -- the
// shape that used to render this sheet with nothing to fill in and no way
// to actually connect.
const GITHUB_REQUEST: PendingCredentialRequest = {
  requestId: "github:default",
  capability: "source-control",
  providerId: "github",
  instanceKey: "default",
  fields: [],
};

const ORIGINAL_LOCATION = window.location;

function receipt(ok: boolean): ConnectionReceipt {
  return {
    connectionId: "conn-1",
    capability: "observability",
    providerId: "posthog",
    instanceKey: "default",
    status: ok ? "ok" : "degraded",
    fingerprint: "sha256:abcd",
    redacted: { projectApiKey: "phc_****" },
    grantedScopes: [],
    missingScopes: [],
    probe: {
      ok,
      vantage: "edge",
      latencyMs: 5,
      checks: [],
      probedAt: "2026-09-10T00:00:00.000Z",
    },
  };
}

function pushStudioCard() {
  useOnboardingStudioStore.getState().pushCard({
    id: "form:posthog:default",
    kind: "form",
    capability: "observability",
    providerId: "posthog",
    instanceKey: "default",
    fields: ["projectApiKey"],
    status: "open",
  });
}

function studioCard() {
  return useOnboardingStudioStore
    .getState()
    .cards.find((card) => card.id === "form:posthog:default");
}

function lastReceipt(onResult: ReturnType<typeof vi.fn>) {
  const message = onResult.mock.calls.at(-1)?.[0] as string;
  expect(message.startsWith(ONBOARDING_RESULT_PREFIX)).toBe(true);
  return JSON.parse(message.slice(ONBOARDING_RESULT_PREFIX.length));
}

beforeEach(() => {
  vi.clearAllMocks();
  useOnboardingStudioStore.getState().reset();
  mockConnections = [];
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      ...ORIGINAL_LOCATION,
      href: "http://localhost/kt-list?repo=1",
      pathname: "/kt-list",
      search: "?repo=1",
    },
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: ORIGINAL_LOCATION,
  });
});

describe("CredentialRequestSheet", () => {
  it("starts from the manifest's defaults like the studio form does", async () => {
    // The sheet began with an empty form, so PostHog's required host -- which
    // the manifest already knows -- blocked submit until the user typed
    // `us.i.posthog.com` themselves. The studio form never asked for it.
    vi.mocked(EnvironmentService.setCredentials).mockResolvedValue(
      receipt(true),
    );
    const user = userEvent.setup();
    const onResult = vi.fn();
    renderSheet({
      request: POSTHOG_REQUEST,
      onDone: vi.fn(),
      onResult,
    });

    expect(screen.getByTestId("connector-field-instanceHost")).toHaveValue(
      "us.i.posthog.com",
    );
    await user.type(
      screen.getByTestId("connector-field-projectApiKey"),
      "phc_secret",
    );
    await user.click(screen.getByTestId("credential-submit"));

    await waitFor(() =>
      expect(EnvironmentService.setCredentials).toHaveBeenCalledTimes(1),
    );
    expect(EnvironmentService.setCredentials).toHaveBeenCalledWith({
      capability: "observability",
      providerId: "posthog",
      instanceKey: "default",
      config: { instanceHost: "us.i.posthog.com" },
      credentials: { projectApiKey: "phc_secret" },
    });
  });

  it("seeds non-secret fields from the connection's saved config, not the manifest default, when rotating a credential", async () => {
    // request_credentials narrows this sheet to a secret rotation on an
    // already-connected provider. Seeding the visible instanceHost field
    // from the manifest default instead of the connection's real, saved
    // host silently overwrote a custom self-hosted PostHog instance with
    // "us.i.posthog.com" on submit.
    vi.mocked(EnvironmentService.setCredentials).mockResolvedValue(
      receipt(true),
    );
    mockConnections = [
      {
        id: "conn-1",
        orgId: "org-1",
        capability: "observability",
        providerId: "posthog",
        instanceKey: "default",
        displayName: null,
        config: { instanceHost: "posthog.internal.example.com" },
        redactedSummary: {},
        requestedScopes: [],
        grantedScopes: [],
        status: "ok",
        lastProbe: null,
        lastProbeAt: null,
        expiresAt: null,
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
    ];
    const user = userEvent.setup();
    const onResult = vi.fn();
    renderSheet({
      request: POSTHOG_REQUEST,
      onDone: vi.fn(),
      onResult,
    });

    await waitFor(() =>
      expect(screen.getByTestId("connector-field-instanceHost")).toHaveValue(
        "posthog.internal.example.com",
      ),
    );
    await user.type(
      screen.getByTestId("connector-field-projectApiKey"),
      "phc_secret",
    );
    await user.click(screen.getByTestId("credential-submit"));

    await waitFor(() =>
      expect(EnvironmentService.setCredentials).toHaveBeenCalledTimes(1),
    );
    expect(EnvironmentService.setCredentials).toHaveBeenCalledWith({
      capability: "observability",
      providerId: "posthog",
      instanceKey: "default",
      config: { instanceHost: "posthog.internal.example.com" },
      credentials: { projectApiKey: "phc_secret" },
    });
  });

  it("settles the studio's copy of the request when the credential is saved here", async () => {
    // The same request is a card in the studio workbench. Answering it from
    // the dock left that card open, so going back to the studio presented an
    // empty form for a credential that was already stored and verified.
    vi.mocked(EnvironmentService.setCredentials).mockResolvedValue(
      receipt(true),
    );
    pushStudioCard();
    const user = userEvent.setup();
    const onDone = vi.fn();
    const onResult = vi.fn();
    renderSheet({
      request: POSTHOG_REQUEST,
      onDone,
      onResult,
    });

    await user.type(
      screen.getByTestId("connector-field-projectApiKey"),
      "phc_secret",
    );
    await user.click(screen.getByTestId("credential-submit"));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(studioCard()).toMatchObject({
      status: "ok",
      result: expect.objectContaining({ ok: true }),
    });
    expect(lastReceipt(onResult)).toMatchObject({
      status: "ok",
      provider: "posthog",
      verified: true,
    });
  });

  it("marks the studio card failed when the server rejects the credential", async () => {
    vi.mocked(EnvironmentService.setCredentials).mockRejectedValue(
      new Error("boom"),
    );
    pushStudioCard();
    const user = userEvent.setup();
    const onDone = vi.fn();
    const onResult = vi.fn();
    renderSheet({
      request: POSTHOG_REQUEST,
      onDone,
      onResult,
    });

    await user.type(
      screen.getByTestId("connector-field-projectApiKey"),
      "phc_secret",
    );
    await user.click(screen.getByTestId("credential-submit"));

    await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
    expect(lastReceipt(onResult)).toMatchObject({
      status: "error",
      provider: "posthog",
    });
    expect(studioCard()).toMatchObject({ status: "failed" });
    // The sheet stays up so the user can correct and retry.
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByTestId("credential-request-sheet")).toBeInTheDocument();
  });

  it("reports a decline to the agent and withdraws the studio card", async () => {
    // Cancel used to close the sheet and say nothing, leaving the agent
    // waiting on a receipt that was never going to arrive.
    pushStudioCard();
    const user = userEvent.setup();
    const onDone = vi.fn();
    const onResult = vi.fn();
    renderSheet({
      request: POSTHOG_REQUEST,
      onDone,
      onResult,
    });

    await user.click(screen.getByTestId("credential-cancel"));

    expect(lastReceipt(onResult)).toEqual({
      status: "cancelled",
      provider: "posthog",
      instance: "default",
    });
    expect(studioCard()).toBeUndefined();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(EnvironmentService.setCredentials).not.toHaveBeenCalled();
  });

  it("starts the OAuth redirect instead of posting an empty credential for an OAuth-only provider", async () => {
    // `open_connection_form` raises this sheet the same way for every
    // provider, OAuth or not. Before this fix, an OAuth provider with no
    // credential fields (github, jira-cloud) rendered here with nothing to
    // fill in, and clicking Submit posted an empty credential straight to
    // the Edge Function -- which then recorded a spurious failed connection
    // instead of ever starting the OAuth redirect.
    vi.mocked(EnvironmentService.startOAuth).mockResolvedValue({
      authorizeUrl: "https://github.com/login/oauth/authorize?x=1",
    });
    const user = userEvent.setup();
    const onResult = vi.fn();
    renderSheet({
      request: GITHUB_REQUEST,
      onDone: vi.fn(),
      onResult,
    });

    expect(screen.queryByTestId(/connector-field-/)).not.toBeInTheDocument();
    await user.click(screen.getByTestId("credential-submit"));

    await waitFor(() =>
      expect(EnvironmentService.startOAuth).toHaveBeenCalledTimes(1),
    );
    expect(EnvironmentService.startOAuth).toHaveBeenCalledWith({
      capability: "source-control",
      providerId: "github",
      instanceKey: "default",
      config: {},
      returnTo: "/kt-list?repo=1",
    });
    expect(EnvironmentService.setCredentials).not.toHaveBeenCalled();
    expect(window.location.href).toBe(
      "https://github.com/login/oauth/authorize?x=1",
    );
  });

  it("reports a receipt to the agent when starting OAuth itself fails", async () => {
    // Mirrors the same guarantee `setCredentials` failures already had: the
    // agent's tool call must resolve one way or another, never hang.
    vi.mocked(EnvironmentService.startOAuth).mockRejectedValue(
      new Error("could not reach github.com"),
    );
    useOnboardingStudioStore.getState().pushCard({
      id: "form:github:default",
      kind: "form",
      capability: "source-control",
      providerId: "github",
      instanceKey: "default",
      fields: "all",
      status: "open",
    });
    const user = userEvent.setup();
    const onResult = vi.fn();
    renderSheet({
      request: GITHUB_REQUEST,
      onDone: vi.fn(),
      onResult,
    });

    await user.click(screen.getByTestId("credential-submit"));

    await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
    expect(lastReceipt(onResult)).toMatchObject({
      status: "error",
      provider: "github",
    });
    expect(
      useOnboardingStudioStore
        .getState()
        .cards.find((card) => card.id === "form:github:default"),
    ).toMatchObject({ status: "failed" });
  });
});
