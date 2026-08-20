import { describe, expect, it } from "vitest";
import { evaluateFreshness, sameCommit } from "#/lib/codegraph/staleness";

const FULL = "32944829e7a63a9fa9c55d811d7f98a9530c6a6a";

describe("sameCommit", () => {
  it("matches identical shas", () => {
    expect(sameCommit(FULL, FULL)).toBe(true);
  });

  it("matches an abbreviated sha against its full form", () => {
    expect(sameCommit("3294482", FULL)).toBe(true);
    expect(sameCommit(FULL, "3294482")).toBe(true);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(sameCommit(` ${FULL.toUpperCase()} `, FULL)).toBe(true);
  });

  it("rejects a prefix too short to identify a commit", () => {
    // "32" prefixes an enormous number of commits; treating it as a match
    // would report a stale graph as fresh.
    expect(sameCommit("32", FULL)).toBe(false);
  });

  it("rejects different commits", () => {
    expect(sameCommit("deadbeef123", FULL)).toBe(false);
  });

  it("rejects empty input", () => {
    expect(sameCommit("", FULL)).toBe(false);
    expect(sameCommit(FULL, "")).toBe(false);
  });
});

describe("evaluateFreshness", () => {
  it("reports fresh when the graph matches HEAD", () => {
    expect(evaluateFreshness(FULL, FULL)).toEqual({
      freshness: "fresh",
      graphCommitSha: FULL,
      headCommitSha: FULL,
      requiresReanalysis: false,
    });
  });

  it("reports stale and demands re-analysis when HEAD has moved", () => {
    const result = evaluateFreshness(
      FULL,
      "aaaaaaabbbbbbbcccccccdddddddeeeeeeefffffff",
    );

    expect(result.freshness).toBe("stale");
    expect(result.requiresReanalysis).toBe(true);
  });

  it("reports unknown rather than fresh when HEAD could not be resolved", () => {
    // Silence here would be indistinguishable from a verified match, so the
    // UI must be able to tell "confirmed current" from "could not check".
    const result = evaluateFreshness(FULL, null);

    expect(result.freshness).toBe("unknown");
    expect(result.requiresReanalysis).toBe(false);
  });
});
