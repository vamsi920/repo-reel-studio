import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "test-utils";
import { TranscriptExportModal } from "#/components/features/conversation/transcript-export-modal";
import EventService from "#/api/event-service/event-service.api";
import { loadCompleteTranscriptEvents } from "#/utils/transcript-export/load-complete-events";
import { useEventStore } from "#/stores/use-event-store";
import { displayErrorToast } from "#/utils/custom-toast-handlers";

const { trackConversationExportedMock, downloadBlobMock } = vi.hoisted(() => ({
  trackConversationExportedMock: vi.fn(),
  downloadBlobMock: vi.fn(),
}));

vi.mock("#/hooks/use-tracking", () => ({
  useTracking: () => ({
    trackConversationExported: trackConversationExportedMock,
  }),
}));

vi.mock("#/utils/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/utils/utils")>();
  return { ...actual, downloadBlob: downloadBlobMock };
});

vi.mock("#/utils/custom-toast-handlers", () => ({
  displayErrorToast: vi.fn(),
}));

vi.mock("#/utils/transcript-export/load-complete-events", () => ({
  loadCompleteTranscriptEvents: vi.fn(),
}));

// A promise this test controls the settlement of, so an export can be held
// "in flight" while we exercise cancel/double-click behavior.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("TranscriptExportModal", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useEventStore.getState().clearEventsForConversation(null);
    vi.spyOn(EventService, "getEventCount").mockResolvedValue(0);
  });

  it("does not re-trigger onClose or any export side effect once a cancelled export settles", async () => {
    const { promise, resolve } = deferred<never[]>();
    vi.mocked(loadCompleteTranscriptEvents).mockReturnValue(promise);
    const user = userEvent.setup();

    renderWithProviders(
      <TranscriptExportModal conversationId="c1" onClose={onClose} />,
    );

    await user.click(screen.getByTestId("confirm-transcript-export"));
    await user.click(screen.getByTestId("cancel-transcript-export"));

    // Cancel closes the modal immediately.
    expect(onClose).toHaveBeenCalledTimes(1);

    // Now let the export the user cancelled actually settle.
    resolve([]);
    await waitFor(() =>
      expect(
        screen.getByTestId("confirm-transcript-export"),
      ).not.toHaveAttribute("aria-busy", "true"),
    );

    // The cancelled export must not call onClose a second time, nor run any
    // of the success-path side effects (download, tracking) or the error
    // toast.
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(downloadBlobMock).not.toHaveBeenCalled();
    expect(trackConversationExportedMock).not.toHaveBeenCalled();
    expect(displayErrorToast).not.toHaveBeenCalled();
  });

  it("ignores a second export click while one is already in flight", async () => {
    const { promise, resolve } = deferred<never[]>();
    vi.mocked(loadCompleteTranscriptEvents).mockReturnValue(promise);
    const user = userEvent.setup();

    renderWithProviders(
      <TranscriptExportModal conversationId="c1" onClose={onClose} />,
    );

    const exportButton = screen.getByTestId("confirm-transcript-export");
    await user.click(exportButton);
    expect(exportButton).toBeDisabled();
    await user.click(exportButton);

    resolve([]);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    expect(loadCompleteTranscriptEvents).toHaveBeenCalledTimes(1);
  });

  it("still completes the export when the event-count pre-check fails", async () => {
    vi.spyOn(EventService, "getEventCount").mockRejectedValue(
      new Error("count endpoint unavailable"),
    );
    vi.mocked(loadCompleteTranscriptEvents).mockResolvedValue([]);
    const user = userEvent.setup();

    renderWithProviders(
      <TranscriptExportModal conversationId="c1" onClose={onClose} />,
    );

    await user.click(screen.getByTestId("confirm-transcript-export"));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    // expectedEventCount is undefined because the count check was swallowed.
    expect(loadCompleteTranscriptEvents).toHaveBeenCalledWith(
      [],
      expect.any(Function),
      undefined,
    );
    expect(downloadBlobMock).toHaveBeenCalledTimes(1);
    expect(displayErrorToast).not.toHaveBeenCalled();
  });
});
