import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OpenAISubscriptionAuthCard } from "#/components/features/settings/llm-settings/openai-subscription-auth-card";
import LLMSubscriptionService from "#/api/llm-subscription-service";
import * as ToastHandlers from "#/utils/custom-toast-handlers";

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OpenAISubscriptionAuthCard />
    </QueryClientProvider>,
  );
}

const challenge = {
  deviceCode: "device-123",
  userCode: "ABCD-1234",
  verificationUri: "https://example.com/verify",
  verificationUriComplete: null,
  expiresAt: null,
  intervalSeconds: 60,
};

describe("OpenAISubscriptionAuthCard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(LLMSubscriptionService, "getOpenAIStatus").mockResolvedValue({
      vendor: "openai",
      connected: false,
      accountEmail: null,
      expiresAt: null,
    });
    vi.spyOn(window, "open").mockImplementation(() => null);
  });

  async function openDeviceChallenge(user: ReturnType<typeof userEvent.setup>) {
    vi.spyOn(LLMSubscriptionService, "startOpenAIDeviceLogin").mockResolvedValue(
      challenge,
    );
    renderCard();

    await user.click(await screen.findByTestId("subscription-connect"));
    await screen.findByTestId("subscription-device-challenge");
  }

  it("shows the copied state after a successful clipboard write", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(writeText);

    await openDeviceChallenge(user);

    const copyButton = screen.getByTestId("copy-to-clipboard");
    expect(copyButton).toHaveAttribute("aria-label", "BUTTON$COPY");

    await user.click(copyButton);

    expect(writeText).toHaveBeenCalledWith(challenge.userCode);
    await waitFor(() =>
      expect(copyButton).toHaveAttribute("aria-label", "BUTTON$COPIED"),
    );
  });

  it("reports a failed clipboard write instead of silently showing 'copied'", async () => {
    const user = userEvent.setup();
    const toastSpy = vi
      .spyOn(ToastHandlers, "displayErrorToast")
      .mockImplementation(() => "toast-id");
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("clipboard unavailable"),
    );

    await openDeviceChallenge(user);

    const copyButton = screen.getByTestId("copy-to-clipboard");
    await user.click(copyButton);

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    expect(copyButton).toHaveAttribute("aria-label", "BUTTON$COPY");
  });
});
