import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CredentialRequestSheet } from "#/components/features/environment/copilot/credential-request-sheet";
import { useOnboardingStudioStore } from "#/stores/onboarding-studio-store";
import type { PendingCredentialRequest } from "#/stores/onboarding-copilot-store";
import { ONBOARDING_RESULT_PREFIX } from "#/constants/onboarding-control";
import { EnvironmentService } from "#/api/environment-service/environment-service.api";
import type { ConnectionReceipt } from "#/lib/environment/types/probe";

vi.mock("#/api/environment-service/environment-service.api", async () => {
  const actual = await vi.importActual<
    typeof import("#/api/environment-service/environment-service.api")
  >("#/api/environment-service/environment-service.api");
  return {
    ...actual,
    EnvironmentService: { setCredentials: vi.fn() },
  };
});

vi.mock("#/utils/custom-toast-handlers", () => ({
  displayErrorToast: vi.fn(),
  displaySuccessToast: vi.fn(),
}));

const POSTHOG_REQUEST: PendingCredentialRequest = {
  requestId: "posthog:default",
  capability: "observability",
  providerId: "posthog",
  instanceKey: "default",
  fields: ["projectApiKey"],
};

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
    render(
      <CredentialRequestSheet
        request={POSTHOG_REQUEST}
        onDone={vi.fn()}
        onResult={onResult}
      />,
    );

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
    render(
      <CredentialRequestSheet
        request={POSTHOG_REQUEST}
        onDone={onDone}
        onResult={onResult}
      />,
    );

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
    render(
      <CredentialRequestSheet
        request={POSTHOG_REQUEST}
        onDone={onDone}
        onResult={onResult}
      />,
    );

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
    render(
      <CredentialRequestSheet
        request={POSTHOG_REQUEST}
        onDone={onDone}
        onResult={onResult}
      />,
    );

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
});
