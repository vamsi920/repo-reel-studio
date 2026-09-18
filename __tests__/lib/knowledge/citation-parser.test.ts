import { describe, expect, it } from "vitest";

import { extractCitedRanges } from "#/lib/knowledge/citation-parser";

describe("extractCitedRanges", () => {
  it("parses a single-line citation", () => {
    const ranges = extractCitedRanges("See [src/index.ts:12]() for details.");

    expect(ranges.get("src/index.ts")).toEqual({
      startLine: 12,
      endLine: undefined,
    });
  });

  it("parses a line-range citation", () => {
    const ranges = extractCitedRanges("Implemented in [src/index.ts:12-34]().");

    expect(ranges.get("src/index.ts")).toEqual({
      startLine: 12,
      endLine: 34,
    });
  });

  it("parses a bare path citation with no line numbers", () => {
    const ranges = extractCitedRanges("Defined in [README.md]().");

    expect(ranges.get("README.md")).toEqual({
      startLine: undefined,
      endLine: undefined,
    });
  });

  it("keeps the first citation and ignores later re-citations of the same path", () => {
    const ranges = extractCitedRanges(
      "First mention [src/index.ts:1-5](), later narrower reference [src/index.ts:2-3]().",
    );

    expect(ranges.get("src/index.ts")).toEqual({ startLine: 1, endLine: 5 });
    expect(ranges.size).toBe(1);
  });

  it("tracks multiple distinct paths independently", () => {
    const ranges = extractCitedRanges(
      "See [src/a.ts:1-2]() and [src/b.ts:9]().",
    );

    expect(ranges.get("src/a.ts")).toEqual({ startLine: 1, endLine: 2 });
    expect(ranges.get("src/b.ts")).toEqual({
      startLine: 9,
      endLine: undefined,
    });
    expect(ranges.size).toBe(2);
  });

  it("ignores non-citation markdown links", () => {
    const ranges = extractCitedRanges(
      "A real [link](https://example.com) is not a citation.",
    );

    expect(ranges.size).toBe(0);
  });

  it("returns an empty map for content with no citations", () => {
    const ranges = extractCitedRanges("Just plain prose, nothing cited.");

    expect(ranges.size).toBe(0);
  });

  it("is safe to call repeatedly despite the shared global regex", () => {
    extractCitedRanges("[a/b.ts:1]()");
    const ranges = extractCitedRanges("[c/d.ts:2]()");

    expect(ranges.has("a/b.ts")).toBe(false);
    expect(ranges.get("c/d.ts")).toEqual({ startLine: 2, endLine: undefined });
  });
});
