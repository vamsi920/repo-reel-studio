import { describe, it, expect } from "vitest";

import { isOpenableBrowserUrl } from "#/components/features/browser/browser-chrome-bar";

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
