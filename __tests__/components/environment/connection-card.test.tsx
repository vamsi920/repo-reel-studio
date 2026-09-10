import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectionCard } from "#/components/features/environment/studio/cards/connection-card";
import { useOnboardingStudioStore } from "#/stores/onboarding-studio-store";
import { useOnboardingCopilotStore } from "#/stores/onboarding-copilot-store";
import { ONBOARDING_RESULT_PREFIX } from "#/constants/onboarding-control";
import { EnvironmentService } from "#/api/environment-service/environment-service.api";
import type { ConnectionReceipt } from "#/lib/environment/types/probe";

vi.mock("#/api/environment-service/environment-service.api", async () => {
  const actual = await vi.importActual<
    typeof import("#/api/environment-service/environment-service.api")
  >("#/api/environment-service/environment-service.api");
  return {
    ...actual,
    EnvironmentService: {
      startOAuth: vi.fn(),
      setCredentials: vi.fn(),
    },
  };
});

vi.mock("#/lib/environment/invalidate-connection-caches", () => ({
  invalidateConnectionCaches: vi.fn(async () => undefined),
}));

vi.mock("#/utils/custom-toast-handlers", () => ({
  displayErrorToast: vi.fn(),
  displaySuccessToast: vi.fn(),
}));

const ORIGINAL_LOCATION = window.location;

function receiptFor(providerId: string): ConnectionReceipt {
  return {
    connectionId: "conn-1",
    capability: "issue-tracker",
    providerId,
    instanceKey: "default",
    status: "ok",
    fingerprint: "sha256:abcd",
    redacted: { apiKey: "lin_****" },
    grantedScopes: [],
    missingScopes: [],
    probe: {
      ok: true,
      vantage: "edge",
      latencyMs: 20,
      checks: [],
      probedAt: "2026-09-10T00:00:00.000Z",
    },
  };
}

function renderCard(
  card: Parameters<typeof ConnectionCard>[0]["card"],
  postResult = vi.fn(),
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  useOnboardingStudioStore.getState().pushCard(card);
  render(
    <QueryClientProvider client={queryClient}>
      <ConnectionCard card={card} postResult={postResult} />
    </QueryClientProvider>,
  );
  return postResult;
}

function lastReceipt(postResult: ReturnType<typeof vi.fn>) {
  const message = postResult.mock.calls.at(-1)?.[0] as string;
  expect(message.startsWith(ONBOARDING_RESULT_PREFIX)).toBe(true);
  return JSON.parse(message.slice(ONBOARDING_RESULT_PREFIX.length));
}

beforeEach(() => {
  vi.clearAllMocks();
  useOnboardingStudioStore.getState().reset();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...ORIGINAL_LOCATION, href: "http://localhost/environment/setup" },
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: ORIGINAL_LOCATION,
  });
});

describe("ConnectionCard", () => {
  it("sends a self-hosted OAuth provider's host along with the OAuth start", async () => {
    // GitHub Enterprise collects its host in the form and only then
    // redirects. The card used to call startOAuth with no config at all, so
    // the Edge Function answered `missing_host_config` and the user could not
    // connect from the studio no matter what they typed.
    vi.mocked(EnvironmentService.startOAuth).mockResolvedValue({
      authorizeUrl: "https://ghe.example.com/login/oauth/authorize?x=1",
    });
    const user = userEvent.setup();
    renderCard({
      id: "form:github-enterprise:default",
      kind: "form",
      capability: "source-control",
      providerId: "github-enterprise",
      instanceKey: "default",
      fields: "all",
      status: "open",
    });

    await user.type(
      screen.getByTestId("connector-field-enterpriseHost"),
      "ghe.example.com",
    );
    await user.click(screen.getByTestId("connection-submit-github-enterprise"));

    await waitFor(() =>
      expect(EnvironmentService.startOAuth).toHaveBeenCalledTimes(1),
    );
    expect(EnvironmentService.startOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "github-enterprise",
        config: { enterpriseHost: "ghe.example.com" },
        returnTo: "/environment/setup",
      }),
    );
    expect(EnvironmentService.setCredentials).not.toHaveBeenCalled();
    expect(window.location.href).toBe(
      "https://ghe.example.com/login/oauth/authorize?x=1",
    );
  });

  it("settles the dock's copy of the request once the credential is saved", async () => {
    // The agent raises the same request on the dock so it is visible from any
    // screen. Answering it in the studio left that copy pending, so the dock
    // kept flashing for a credential the user had already entered.
    vi.mocked(EnvironmentService.setCredentials).mockResolvedValue(
      receiptFor("linear"),
    );
    useOnboardingCopilotStore.getState().requestCredentials({
      requestId: "linear:default",
      capability: "issue-tracker",
      providerId: "linear",
      instanceKey: "default",
      fields: ["apiKey"],
    });
    const user = userEvent.setup();
    const postResult = renderCard({
      id: "form:linear:default",
      kind: "form",
      capability: "issue-tracker",
      providerId: "linear",
      instanceKey: "default",
      fields: "all",
      status: "open",
    });

    await user.type(
      screen.getByTestId("connector-field-apiKey"),
      "lin_api_abc123",
    );
    await user.click(screen.getByTestId("connection-submit-linear"));

    await waitFor(() =>
      expect(
        useOnboardingCopilotStore.getState().pendingCredentialRequest,
      ).toBeNull(),
    );
    expect(EnvironmentService.setCredentials).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "linear",
        credentials: { apiKey: "lin_api_abc123" },
        config: {},
      }),
    );
    await waitFor(() => expect(postResult).toHaveBeenCalled());
    expect(lastReceipt(postResult)).toMatchObject({
      status: "ok",
      provider: "linear",
      verified: true,
    });
    expect(
      useOnboardingStudioStore
        .getState()
        .cards.find((card) => card.id === "form:linear:default"),
    ).toMatchObject({ status: "ok" });
  });

  it("leaves a different provider's dock request alone", async () => {
    vi.mocked(EnvironmentService.setCredentials).mockResolvedValue(
      receiptFor("linear"),
    );
    const other = {
      requestId: "anthropic:default",
      capability: "llm" as const,
      providerId: "anthropic",
      instanceKey: "default",
      fields: ["apiKey"],
    };
    useOnboardingCopilotStore.getState().requestCredentials(other);
    const user = userEvent.setup();
    const postResult = renderCard({
      id: "form:linear:default",
      kind: "form",
      capability: "issue-tracker",
      providerId: "linear",
      instanceKey: "default",
      fields: "all",
      status: "open",
    });

    await user.type(
      screen.getByTestId("connector-field-apiKey"),
      "lin_api_abc123",
    );
    await user.click(screen.getByTestId("connection-submit-linear"));
    await waitFor(() => expect(postResult).toHaveBeenCalled());

    expect(
      useOnboardingCopilotStore.getState().pendingCredentialRequest,
    ).toEqual(other);
  });

  it("tells the agent when the user declines instead of leaving it waiting", async () => {
    // Cancel used to remove the card and say nothing. The agent had been told
    // to wait for a receipt, so it sat on a turn that was never coming.
    useOnboardingCopilotStore.getState().requestCredentials({
      requestId: "linear:default",
      capability: "issue-tracker",
      providerId: "linear",
      instanceKey: "default",
      fields: ["apiKey"],
    });
    const user = userEvent.setup();
    const postResult = renderCard({
      id: "form:linear:default",
      kind: "form",
      capability: "issue-tracker",
      providerId: "linear",
      instanceKey: "default",
      fields: "all",
      status: "open",
    });

    await user.click(screen.getByTestId("connection-cancel-linear"));

    expect(lastReceipt(postResult)).toEqual({
      status: "cancelled",
      provider: "linear",
      instance: "default",
    });
    expect(
      useOnboardingStudioStore
        .getState()
        .cards.some((card) => card.id === "form:linear:default"),
    ).toBe(false);
    expect(
      useOnboardingCopilotStore.getState().pendingCredentialRequest,
    ).toBeNull();
    expect(EnvironmentService.setCredentials).not.toHaveBeenCalled();
  });
});
