import { describe, expect, it } from "vitest";

import { parseRepoContent } from "@/lib/parseRepoContent";

describe("parseRepoContent", () => {
  it("returns an empty map for empty input", () => {
    expect(parseRepoContent("")).toEqual({});
  });

  it("parses the '=== File: path ===' gitingest format", () => {
    const content = [
      "================",
      "File: src/a.ts",
      "================",
      "export const a = 1;",
      "",
      "================",
      "File: src/b.ts",
      "================",
      "export const b = 2;",
    ].join("\n");

    expect(parseRepoContent(content)).toEqual({
      "src/a.ts": "export const a = 1;",
      "src/b.ts": "export const b = 2;",
    });
  });

  it("parses the dashed 'File:' format with CRLF line endings", () => {
    const content = ["--------", "File: src/a.ts", "--------", "line one", "line two"].join("\r\n");

    expect(parseRepoContent(content)).toEqual({ "src/a.ts": "line one\r\nline two" });
  });

  it("parses the '--- FILE: path ---' header format", () => {
    const content = ["---- FILE: pkg/main.go ----", "package main", "", "---- FILE: pkg/util.go ----", "package util"].join(
      "\n"
    );

    expect(parseRepoContent(content)).toEqual({
      "pkg/main.go": "package main",
      "pkg/util.go": "package util",
    });
  });

  it("falls back to line scanning and strips visual separators", () => {
    const content = ["file: src/a.ts", "===", "const a = 1;", "file: src/b.ts", "const b = 2;"].join("\n");

    expect(parseRepoContent(content)).toEqual({
      "src/a.ts": "const a = 1;",
      "src/b.ts": "const b = 2;",
    });
  });

  it("ignores content that appears before the first file header", () => {
    const content = ["Directory structure:", "  src/", "file: src/a.ts", "const a = 1;"].join("\n");

    expect(parseRepoContent(content)).toEqual({ "src/a.ts": "const a = 1;" });
  });

  it("returns an empty map when no file headers exist", () => {
    expect(parseRepoContent("just some prose\nwith no headers")).toEqual({});
  });
});
