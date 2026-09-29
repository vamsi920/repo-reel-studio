import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BrowserChromeBar,
  isOpenableBrowserUrl,
} from "#/components/features/browser/browser-chrome-bar";

function stubClipboard(clipboard: Clipboard | undefined) {
  Object.defineProperty(navigator, "clipboard", {
    value: clipboard,
    configurable: true,
    writable: true,
  });
}

// `isOpenableBrowserUrl` is the only thing standing between an
// agent-reported URL and a real, user-clickable `<a href>` (see
// BrowserChromeBar) — it must reject every scheme except http(s). Only the
// `javascript:` case was covered before, indirectly, through browser.test.tsx.
describe("isOpenableBrowserUrl", () => {
  it.each([
    ["https://example.com", true],
    ["http://example.com", true],
    ["https://example.com/path?q=1#frag", true],
    // Scheme matching is case-insensitive per the URL spec.
    ["HTTPS://example.com", true],
    // Leading/trailing whitespace is trimmed by the URL parser.
    ["  https://example.com  ", true],
  ])("accepts %s", (url, expected) => {
    expect(isOpenableBrowserUrl(url)).toBe(expected);
  });

  it.each([
    ["javascript:alert(1)"],
    ["data:text/html,<script>alert(1)</script>"],
    ["vbscript:msgbox(1)"],
    ["mailto:a@b.com"],
    ["ftp://example.com/file"],
    ["file:///etc/passwd"],
    // Protocol-relative and bare relative paths have no scheme at all.
    ["//evil.example.com"],
    ["relative/path"],
    [""],
  ])("rejects %s", (url) => {
    expect(isOpenableBrowserUrl(url)).toBe(false);
  });
});

describe("BrowserChromeBar copy button", () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, "clipboard");
    vi.restoreAllMocks();
  });

  it("copies the current URL to the clipboard and shows a confirmation", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText } as unknown as Clipboard);

    render(<BrowserChromeBar url="https://example.com/page" hasPage />);

    const copyButton = screen.getByTestId("browser-chrome-copy-url");
    await user.click(copyButton);

    expect(writeText).toHaveBeenCalledWith("https://example.com/page");
    expect(copyButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "BUTTON$COPIED" })).toBe(
      copyButton,
    );
  });

  it("disables the copy button when there is no URL yet", () => {
    render(<BrowserChromeBar url="" hasPage={false} />);

    expect(
      screen.queryByTestId("browser-chrome-copy-url"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "BUTTON$COPY" })).toBeDisabled();
  });
});
