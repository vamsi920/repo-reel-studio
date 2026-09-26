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
import type { ConnectionRecord } from "#/lib/data-platform/repositories/connections-repository";

let mockConnections: ConnectionRecord[] = [];

vi.mock("#/hooks/query/use-connections", () => ({
  useConnections: () => ({ data: mockConnections }),
}));

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
  mockConnections = [];
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

  it("reports a receipt to the agent when starting OAuth itself fails", async () => {
    // Every other failure path in this card (a rejected credential save, a
    // decline) settles the card and posts a receipt. The OAuth-start catch
    // block used to only toast and reset `submitting`, leaving the agent's
    // tool call hanging with no idea the attempt failed.
    vi.mocked(EnvironmentService.startOAuth).mockRejectedValue(
      new Error("could not reach host"),
    );
    useOnboardingCopilotStore.getState().requestCredentials({
      requestId: "github-enterprise:default",
      capability: "source-control",
      providerId: "github-enterprise",
      instanceKey: "default",
      fields: [],
    });
    const user = userEvent.setup();
    const postResult = renderCard({
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

    await waitFor(() => expect(postResult).toHaveBeenCalledTimes(1));
    expect(lastReceipt(postResult)).toMatchObject({
      status: "error",
      provider: "github-enterprise",
    });
    expect(
      useOnboardingStudioStore
        .getState()
        .cards.find((card) => card.id === "form:github-enterprise:default"),
    ).toMatchObject({ status: "failed" });
    expect(
      useOnboardingCopilotStore.getState().pendingCredentialRequest,
    ).toBeNull();
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

  it("settles the dock's copy of the request even when setCredentials itself throws", async () => {
    // The catch branch told the agent "error" and marked the card "failed",
    // but never cleared the copilot store's pending request -- so the dock's
    // live pip kept flagging a request that had already been answered.
    vi.mocked(EnvironmentService.setCredentials).mockRejectedValue(
      new Error("network error"),
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

    await waitFor(() => expect(postResult).toHaveBeenCalled());
    expect(lastReceipt(postResult)).toMatchObject({
      status: "error",
      provider: "linear",
    });
    expect(
      useOnboardingCopilotStore.getState().pendingCredentialRequest,
    ).toBeNull();
    expect(
      useOnboardingStudioStore
        .getState()
        .cards.find((card) => card.id === "form:linear:default"),
    ).toMatchObject({ status: "failed" });
  });

  it("seeds non-secret fields from the connection's saved config, not the manifest default, when reopened on an already-connected provider", async () => {
    // `open_connection_form`/`request_credentials` raise this same card for a
    // provider the user already connected (e.g. fixing a failed probe or
    // rotating a secret). The form used to seed every non-secret field from
    // the manifest's default instead of the connection's real, saved value,
    // so submitting -- even just to rotate the secret -- silently overwrote
    // a custom self-hosted host with the manifest default.
    vi.mocked(EnvironmentService.setCredentials).mockResolvedValue(
      receiptFor("posthog"),
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
    const postResult = renderCard({
      id: "form:posthog:default",
      kind: "form",
      capability: "observability",
      providerId: "posthog",
      instanceKey: "default",
      fields: "all",
      status: "open",
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
    await user.click(screen.getByTestId("connection-submit-posthog"));

    await waitFor(() =>
      expect(EnvironmentService.setCredentials).toHaveBeenCalledTimes(1),
    );
    expect(EnvironmentService.setCredentials).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "posthog",
        config: { instanceHost: "posthog.internal.example.com" },
        credentials: { projectApiKey: "phc_secret" },
      }),
    );
    expect(postResult).toHaveBeenCalled();
  });

  it("hides a secret field the request didn't ask for, but keeps every non-secret field visible", async () => {
    // `card.fields` narrows a `request_credentials` card to the one secret
    // being rotated (documented on `WorkbenchCard["fields"]`), but the form
    // ignored it and always rendered every manifest field -- so a request to
    // rotate just `secretAccessKey` still showed the unrelated
    // `sessionToken` field too.
    vi.mocked(EnvironmentService.setCredentials).mockResolvedValue(
      receiptFor("aws-bedrock"),
    );
    const user = userEvent.setup();
    const postResult = renderCard({
      id: "form:aws-bedrock:default",
      kind: "form",
      capability: "llm",
      providerId: "aws-bedrock",
      instanceKey: "default",
      fields: ["secretAccessKey"],
      status: "open",
    });

    // Non-secret fields stay visible so a required value can still be
    // corrected; the secret that wasn't requested does not.
    expect(screen.getByTestId("connector-field-region")).toBeInTheDocument();
    expect(
      screen.getByTestId("connector-field-accessKeyId"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("connector-field-secretAccessKey"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("connector-field-sessionToken"),
    ).not.toBeInTheDocument();

    await user.type(
      screen.getByTestId("connector-field-accessKeyId"),
      "AKIAEXAMPLE",
    );
    await user.type(
      screen.getByTestId("connector-field-secretAccessKey"),
      "secret-value",
    );
    await user.click(screen.getByTestId("connection-submit-aws-bedrock"));

    await waitFor(() =>
      expect(EnvironmentService.setCredentials).toHaveBeenCalledTimes(1),
    );
    expect(EnvironmentService.setCredentials).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "aws-bedrock",
        config: { region: "us-east-1", accessKeyId: "AKIAEXAMPLE" },
        credentials: { secretAccessKey: "secret-value" },
      }),
    );
    expect(postResult).toHaveBeenCalled();
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
