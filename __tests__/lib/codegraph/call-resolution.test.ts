import { describe, expect, it } from "vitest";
import { resolveCalleeFile } from "#/lib/codegraph/call-resolution";

describe("resolveCalleeFile", () => {
  it("resolves to the caller's own file when it defines the callee locally, even if an earlier-processed file defines a same-named function", () => {
    // functionOwner reflects "first definition wins" and points `handle` at
    // an unrelated file that happens to define a function of the same name.
    const functionOwner = new Map([["handle", "src/unrelated.ts"]]);

    const result = resolveCalleeFile(
      "src/caller.ts",
      "handle",
      ["handle", "otherLocalFn"],
      functionOwner,
    );

    expect(result).toBe("src/caller.ts");
  });

  it("falls back to the cross-file map when the caller has no local definition", () => {
    const functionOwner = new Map([["shared", "src/utils.ts"]]);

    const result = resolveCalleeFile(
      "src/caller.ts",
      "shared",
      ["otherLocalFn"],
      functionOwner,
    );

    expect(result).toBe("src/utils.ts");
  });

  it("returns null when nobody defines the callee", () => {
    const result = resolveCalleeFile(
      "src/caller.ts",
      "missing",
      [],
      new Map(),
    );

    expect(result).toBeNull();
  });
});
