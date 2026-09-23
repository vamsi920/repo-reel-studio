import { describe, expect, it } from "vitest";
import { selectFilesToAnalyze } from "#/lib/codegraph/file-selection";

describe("selectFilesToAnalyze", () => {
  it("keeps every file and reports no reduction when under the cap", () => {
    const result = selectFilesToAnalyze(["a.ts", "b.ts", "c.ts"], 10);

    expect(result).toEqual({
      selected: ["a.ts", "b.ts", "c.ts"],
      reducedAnalysis: false,
      skippedFileCount: 0,
    });
  });

  it("keeps every file when the count exactly equals the cap", () => {
    const result = selectFilesToAnalyze(["a.ts", "b.ts"], 2);

    expect(result.reducedAnalysis).toBe(false);
    expect(result.skippedFileCount).toBe(0);
    expect(result.selected).toEqual(["a.ts", "b.ts"]);
  });

  it("truncates and reports the exact skipped count when over the cap", () => {
    const files = ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"];

    const result = selectFilesToAnalyze(files, 3);

    expect(result.selected).toEqual(["a.ts", "b.ts", "c.ts"]);
    expect(result.reducedAnalysis).toBe(true);
    expect(result.skippedFileCount).toBe(2);
  });

  it("does not mutate the input array", () => {
    const files = ["a.ts", "b.ts", "c.ts"];

    selectFilesToAnalyze(files, 1);

    expect(files).toEqual(["a.ts", "b.ts", "c.ts"]);
  });
});
