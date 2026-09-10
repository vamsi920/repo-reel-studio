import { afterEach, describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "#/utils/copy-text-to-clipboard";
import * as ToastHandlers from "#/utils/custom-toast-handlers";

/**
 * jsdom ships no `navigator.clipboard`, so each case installs the exact
 * clipboard the browser would expose — including none at all, which is what an
 * insecure context (plain http on a LAN address) actually gives the page.
 */
function stubClipboard(clipboard: Clipboard | undefined) {
  Object.defineProperty(navigator, "clipboard", {
    value: clipboard,
    configurable: true,
    writable: true,
  });
}

describe("copyTextToClipboard", () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, "clipboard");
    vi.restoreAllMocks();
  });

  it("writes the text and reports success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText } as unknown as Clipboard);

    await expect(copyTextToClipboard("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("toasts and reports failure when the write is rejected", async () => {
    const toastSpy = vi
      .spyOn(ToastHandlers, "displayErrorToast")
      .mockImplementation(() => "toast-id");
    stubClipboard({
      writeText: vi.fn().mockRejectedValue(new Error("denied")),
    } as unknown as Clipboard);

    await expect(copyTextToClipboard("hello")).resolves.toBe(false);
    expect(toastSpy).toHaveBeenCalled();
  });

  it("does not throw when the clipboard API is missing entirely", async () => {
    const toastSpy = vi
      .spyOn(ToastHandlers, "displayErrorToast")
      .mockImplementation(() => "toast-id");
    stubClipboard(undefined);

    await expect(copyTextToClipboard("hello")).resolves.toBe(false);
    expect(toastSpy).toHaveBeenCalled();
  });
});
