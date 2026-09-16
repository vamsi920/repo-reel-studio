import { describe, expect, it } from "vitest";
import {
  getBrowserObservationText,
  getReportedBrowserUrl,
} from "#/utils/browser-observation";
import type { BrowserObservation } from "#/types/agent-server/core/base/observation";

const wire = (
  text: string,
  extra: Partial<BrowserObservation> = {},
): BrowserObservation =>
  ({
    kind: "BrowserObservation",
    content: [{ type: "text", text }],
    is_error: false,
    ...extra,
  }) as BrowserObservation;

describe("getBrowserObservationText", () => {
  it("joins the TextContent list", () => {
    expect(
      getBrowserObservationText({
        kind: "BrowserObservation",
        content: [
          { type: "text", text: "a" },
          { type: "image", image_urls: ["data:x"] },
          { type: "text", text: "b" },
        ],
      } as BrowserObservation),
    ).toBe("a\nb");
  });

  it("falls back to the legacy output field", () => {
    expect(
      getBrowserObservationText({
        kind: "BrowserObservation",
        output: "legacy",
        error: null,
        screenshot_data: null,
      }),
    ).toBe("legacy");
  });
});

describe("getReportedBrowserUrl", () => {
  it("reads the url from a browser_get_state JSON payload", () => {
    expect(
      getReportedBrowserUrl(
        wire(
          JSON.stringify(
            { url: "http://localhost:8765/index.html", title: "t", tabs: [] },
            null,
            2,
          ),
        ),
      ),
    ).toBe("http://localhost:8765/index.html");
  });

  it("reads the url from a browser_get_content <url> block", () => {
    expect(
      getReportedBrowserUrl(
        wire(
          "<url>\nhttps://example.com/a?b=1\n</url>\n<content>\n<webpage_content>\n<url>not this</url>\n</webpage_content>\n</content>",
        ),
      ),
    ).toBe("https://example.com/a?b=1");
  });

  it("does not treat the navigate echo as a reported url", () => {
    expect(
      getReportedBrowserUrl(wire("Navigated to: https://example.com")),
    ).toBeNull();
  });

  it("returns null for errors, malformed JSON and empty output", () => {
    expect(
      getReportedBrowserUrl(
        wire(JSON.stringify({ url: "https://example.com" }), {
          is_error: true,
        }),
      ),
    ).toBeNull();
    expect(
      getReportedBrowserUrl(
        wire(JSON.stringify({ url: "https://example.com" }), {
          error: "boom",
        }),
      ),
    ).toBeNull();
    expect(getReportedBrowserUrl(wire("{ not json"))).toBeNull();
    expect(getReportedBrowserUrl(wire(JSON.stringify({ url: "" })))).toBeNull();
    expect(
      getReportedBrowserUrl(wire(JSON.stringify({ title: "x" }))),
    ).toBeNull();
    expect(getReportedBrowserUrl(wire(""))).toBeNull();
  });
});
