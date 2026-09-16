import { beforeEach, describe, expect, it } from "vitest";

import { useBrowserStore } from "#/stores/browser-store";

const shot = "data:image/png;base64,abc123";

describe("useBrowserStore", () => {
  beforeEach(() => {
    useBrowserStore.getState().reset();
  });

  it("drops the screenshot when the URL moves to a different page", () => {
    useBrowserStore.getState().setUrl("http://127.0.0.1:8765/a.html");
    useBrowserStore.getState().setScreenshotSrc(shot);

    useBrowserStore.getState().setUrl("http://127.0.0.1:8765/b.html");

    expect(useBrowserStore.getState().url).toBe("http://127.0.0.1:8765/b.html");
    expect(useBrowserStore.getState().screenshotSrc).toBe("");
  });

  it("keeps the screenshot when the same URL is reported again", () => {
    useBrowserStore.getState().setUrl("https://example.com");
    useBrowserStore.getState().setScreenshotSrc(shot);

    useBrowserStore.getState().setUrl("https://example.com");

    expect(useBrowserStore.getState().screenshotSrc).toBe(shot);
  });

  it("stores a screenshot set after the URL it was taken on", () => {
    useBrowserStore.getState().setUrl("https://example.com/a");
    useBrowserStore.getState().setScreenshotSrc(shot);
    useBrowserStore.getState().setUrl("https://example.com/b");
    useBrowserStore.getState().setScreenshotSrc("data:image/png;base64,b");

    expect(useBrowserStore.getState().url).toBe("https://example.com/b");
    expect(useBrowserStore.getState().screenshotSrc).toBe(
      "data:image/png;base64,b",
    );
  });

  it("reset clears both", () => {
    useBrowserStore.getState().setUrl("https://example.com");
    useBrowserStore.getState().setScreenshotSrc(shot);
    useBrowserStore.getState().reset();
    expect(useBrowserStore.getState()).toMatchObject({
      url: "",
      screenshotSrc: "",
    });
  });
});
