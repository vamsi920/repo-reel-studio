import { describe, it, expect, beforeEach } from "vitest";

import { handleObservationMessage } from "#/services/observations";
import { useBrowserStore } from "#/stores/browser-store";
import type { ObservationMessage } from "#/types/message";

const makeBrowse = (
  observation: "browse" | "browse_interactive",
  extras: Record<string, string>,
): ObservationMessage => ({
  observation,
  id: 1,
  cause: 0,
  content: "",
  extras: { metadata: {}, error_id: "", ...extras },
  message: "",
  timestamp: new Date().toISOString(),
});

describe("handleObservationMessage", () => {
  beforeEach(() => {
    useBrowserStore.getState().reset();
  });

  it("updates browser state when receiving a browse observation", () => {
    handleObservationMessage(
      makeBrowse("browse", {
        url: "https://example.com",
        screenshot: "data:image/png;base64,abc",
      }),
    );

    expect(useBrowserStore.getState().url).toBe("https://example.com");
    expect(useBrowserStore.getState().screenshotSrc).toBe(
      "data:image/png;base64,abc",
    );
  });

  it("updates browser state when receiving a browse_interactive observation", () => {
    handleObservationMessage(
      makeBrowse("browse_interactive", {
        url: "https://example.com/next",
        screenshot: "data:image/png;base64,def",
      }),
    );

    expect(useBrowserStore.getState().url).toBe("https://example.com/next");
    expect(useBrowserStore.getState().screenshotSrc).toBe(
      "data:image/png;base64,def",
    );
  });

  // A browse observation that reports a new URL but carries no screenshot
  // must not leave the previous page's image under the new address.
  it("drops the old screenshot when a browse observation moves to a new URL without one", () => {
    handleObservationMessage(
      makeBrowse("browse", {
        url: "http://127.0.0.1:8765/a.html",
        screenshot: "data:image/png;base64,pageA",
      }),
    );
    handleObservationMessage(
      makeBrowse("browse", { url: "http://127.0.0.1:8765/b.html" }),
    );

    expect(useBrowserStore.getState().url).toBe("http://127.0.0.1:8765/b.html");
    expect(useBrowserStore.getState().screenshotSrc).toBe("");
  });

  it("keeps the screenshot when the same URL is reported without one", () => {
    handleObservationMessage(
      makeBrowse("browse_interactive", {
        url: "https://example.com",
        screenshot: "data:image/png;base64,same",
      }),
    );
    handleObservationMessage(
      makeBrowse("browse_interactive", { url: "https://example.com" }),
    );

    expect(useBrowserStore.getState().screenshotSrc).toBe(
      "data:image/png;base64,same",
    );
  });
});
