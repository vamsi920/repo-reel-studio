import { describe, expect, it } from "vitest";
import {
  analyzerFailureReason,
  inWorkspace,
  mapSearchEntries,
  parseProgress,
} from "#/lib/codegraph/analyzer-runner";

describe("inWorkspace", () => {
  // The agent-server's /api/file/upload and /api/file/download take the path
  // verbatim and reject a relative one with
  // `400 {"detail":"Path must be absolute"}`. The SDK does not prefix
  // workingDir, so every path we hand it has to be built through this.
  it("produces an absolute path under the workspace root", () => {
    expect(inWorkspace("/workspace/project", ".neodevex/codegraph")).toBe(
      "/workspace/project/.neodevex/codegraph",
    );
  });

  it("never returns a relative path", () => {
    expect(inWorkspace("/ws", "a/b.json").startsWith("/")).toBe(true);
  });

  it("does not double up separators", () => {
    expect(inWorkspace("/workspace/project/", "/a/b.json")).toBe(
      "/workspace/project/a/b.json",
    );
  });

  it("resolves a repository-relative source file", () => {
    expect(inWorkspace("/workspace/app", "src/pay/charge.ts")).toBe(
      "/workspace/app/src/pay/charge.ts",
    );
  });
});

describe("parseProgress", () => {
  it("reads the analyzer's JSON-lines milestones off stdout", () => {
    const stdout = [
      '{"__codegraph":"analyzing"}',
      '{"__codegraph":"relationships","fileCount":2550}',
      '{"__codegraph":"mapped","fileCount":2550,"symbolCount":6778}',
      '{"__codegraph":"ready","subsystemCount":13}',
    ].join("\n");

    expect(parseProgress(stdout)).toEqual([
      { phase: "analyzing" },
      { phase: "relationships", fileCount: 2550 },
      { phase: "mapped", fileCount: 2550, symbolCount: 6778 },
      { phase: "ready", subsystemCount: 13 },
    ]);
  });

  it("ignores tree-sitter's own grammar warnings on the same stream", () => {
    const stdout = [
      "tree-sitter: Could not load grammar for ruby, skipping structural analysis",
      '{"__codegraph":"ready","subsystemCount":3}',
      "some other noise",
    ].join("\n");

    expect(parseProgress(stdout)).toEqual([
      { phase: "ready", subsystemCount: 3 },
    ]);
  });

  it("ignores JSON that is not ours", () => {
    expect(parseProgress('{"hello":"world"}')).toEqual([]);
  });

  it("survives a truncated line without losing the rest", () => {
    const stdout = [
      '{"__codegraph":"analy',
      '{"__codegraph":"ready","subsystemCount":1}',
    ].join("\n");

    expect(parseProgress(stdout)).toEqual([
      { phase: "ready", subsystemCount: 1 },
    ]);
  });

  it("carries the failure reason through", () => {
    expect(parseProgress('{"__codegraph":"failed","reason":"ENOENT"}')).toEqual(
      [{ phase: "failed", reason: "ENOENT" }],
    );
  });

  it("returns nothing for empty output", () => {
    expect(parseProgress("")).toEqual([]);
  });
});

describe("analyzerFailureReason", () => {
  it("prefers the analyzer's own failed milestone", () => {
    expect(
      analyzerFailureReason({
        stdout: '{"__codegraph":"failed","reason":"ENOENT: grammars"}',
        stderr: "node: some stack trace",
      }),
    ).toBe("ENOENT: grammars");
  });

  it("falls back to the tail of stderr", () => {
    expect(analyzerFailureReason({ stdout: "", stderr: "  Killed\n" })).toBe(
      "Killed",
    );
  });

  it("never returns an empty reason", () => {
    // `"".slice(-500) ?? fallback` used to yield "" here, and the page then
    // rendered "Graph analysis failed" over a blank line.
    expect(analyzerFailureReason({ stdout: "", stderr: "" })).toBe(
      "analyzer exited non-zero",
    );
    expect(analyzerFailureReason({ stdout: null, stderr: null })).toBe(
      "analyzer exited non-zero",
    );
  });

  it("uses pre-parsed events when given", () => {
    expect(
      analyzerFailureReason({
        events: [{ phase: "failed", reason: "out of memory" }],
        stderr: "ignored",
      }),
    ).toBe("out of memory");
  });
});

describe("mapSearchEntries", () => {
  it("maps compact tuples to entries", () => {
    expect(
      mapSearchEntries([
        ["file:a.ts", "a.ts", "file", "a.ts", "module:src", "unit"],
      ]),
    ).toEqual([
      {
        id: "file:a.ts",
        name: "a.ts",
        type: "file",
        filePath: "a.ts",
        parentId: "module:src",
        level: "unit",
      },
    ]);
  });

  it("returns nothing for a corrupt or missing index instead of throwing", () => {
    // A partially mirrored `search.json` used to throw out of
    // `loadSearchIndex` and leave the search box silently dead.
    expect(mapSearchEntries(null)).toEqual([]);
    expect(mapSearchEntries({ not: "an array" })).toEqual([]);
    expect(mapSearchEntries("garbage")).toEqual([]);
  });

  it("skips malformed rows and fills missing columns", () => {
    expect(
      mapSearchEntries(["not a row", [42, "bad id"], ["sym:x", "x"]]),
    ).toEqual([
      {
        id: "sym:x",
        name: "x",
        type: "",
        filePath: "",
        parentId: "",
        level: "",
      },
    ]);
  });
});
