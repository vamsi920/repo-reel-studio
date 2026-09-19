import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

  describe("device-flow polling resilience", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("keeps polling after a single transient poll failure instead of abandoning the flow", async () => {
      const user = userEvent.setup();
      const toastSpy = vi
        .spyOn(ToastHandlers, "displayErrorToast")
        .mockImplementation(() => "toast-id");
      const pollSpy = vi
        .spyOn(LLMSubscriptionService, "pollOpenAIDeviceLogin")
        .mockRejectedValueOnce(new Error("network blip"))
        .mockResolvedValueOnce({
          vendor: "openai",
          connected: true,
          accountEmail: null,
          expiresAt: null,
        });

      await openDeviceChallenge(user);
      const intervalMs = challenge.intervalSeconds * 1000;

      // First poll fails (transient) -- should not surface an error or stop.
      await vi.advanceTimersByTimeAsync(intervalMs);
      await waitFor(() => expect(pollSpy).toHaveBeenCalledTimes(1));
      expect(toastSpy).not.toHaveBeenCalled();
      expect(
        screen.queryByTestId("subscription-device-challenge"),
      ).not.toBeNull();

      // Second poll succeeds -- the flow should still complete normally.
      await vi.advanceTimersByTimeAsync(intervalMs);
      await waitFor(() => expect(pollSpy).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(
          screen.queryByTestId("subscription-device-challenge"),
        ).toBeNull(),
      );
    });

    it("stops polling and shows an error after repeated consecutive poll failures", async () => {
      const user = userEvent.setup();
      const toastSpy = vi
        .spyOn(ToastHandlers, "displayErrorToast")
        .mockImplementation(() => "toast-id");
      const pollSpy = vi
        .spyOn(LLMSubscriptionService, "pollOpenAIDeviceLogin")
        .mockRejectedValue(new Error("still down"));

      await openDeviceChallenge(user);
      const intervalMs = challenge.intervalSeconds * 1000;

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        // eslint-disable-next-line no-await-in-loop
        await vi.advanceTimersByTimeAsync(intervalMs);
        // eslint-disable-next-line no-await-in-loop
        await waitFor(() => expect(pollSpy).toHaveBeenCalledTimes(attempt));
      }

      await waitFor(() => expect(toastSpy).toHaveBeenCalled());

      // No further polls are scheduled once the flow has given up.
      await vi.advanceTimersByTimeAsync(intervalMs);
      expect(pollSpy).toHaveBeenCalledTimes(3);
    });

    it("keeps auto-polling after a manual 'Finish Sign In' click comes back not-yet-connected", async () => {
      const user = userEvent.setup();
      const pollSpy = vi
        .spyOn(LLMSubscriptionService, "pollOpenAIDeviceLogin")
        .mockResolvedValueOnce({
          vendor: "openai",
          connected: false,
          accountEmail: null,
          expiresAt: null,
        })
        .mockResolvedValueOnce({
          vendor: "openai",
          connected: true,
          accountEmail: null,
          expiresAt: null,
        });

      await openDeviceChallenge(user);
      const intervalMs = challenge.intervalSeconds * 1000;

      // Manual poll: not connected yet.
      await user.click(await screen.findByTestId("subscription-poll"));
      await waitFor(() => expect(pollSpy).toHaveBeenCalledTimes(1));
      expect(
        screen.queryByTestId("subscription-device-challenge"),
      ).not.toBeNull();

      // The background loop must still be alive: advancing the timer alone
      // (no further manual clicks) should trigger the next poll and connect.
      await vi.advanceTimersByTimeAsync(intervalMs);
      await waitFor(() => expect(pollSpy).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(
          screen.queryByTestId("subscription-device-challenge"),
        ).toBeNull(),
      );
    });
  });
});
