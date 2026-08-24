import { describe, expect, it } from "vitest";
import { buildKtManifestFromKnowledgePage } from "#/lib/kt-video/build-manifest";

const page = {
  id: "page-1",
  title: "Auth Flow",
  description: "How auth works.",
  relevantFiles: [
    { path: "src/util.ts" },
    { path: "src/entry.ts" },
  ],
  diagrams: [],
};

describe("buildKtManifestFromKnowledgePage", () => {
  it("ranks declared relevant files instead of taking them in declared order", () => {
    // util.ts is a plain leaf module; entry.ts is imported by it AND matches
    // an entry-point hint — rankFiles should surface it first even though
    // it's declared second.
    const fileContents = {
      "src/util.ts": `import { start } from "./entry";\nexport function helper() {\n  return start();\n}\n`,
      "src/entry.ts": `export function start() {\n  return 1;\n}\n`.repeat(10),
    };

    const manifest = buildKtManifestFromKnowledgePage(page, fileContents, []);
    const codeScenes = manifest.scenes.filter((s) => s.type === "code");

    expect(codeScenes.map((s) => s.file_path)).toEqual([
      "src/entry.ts",
      "src/util.ts",
    ]);
  });

  it("adds a real concept/flow scene when >=2 valid hops are given", () => {
    const fileContents = {
      "src/util.ts": "export function helper() {\n  return 1;\n}\n",
      "src/entry.ts": "export function start() {\n  return helper();\n}\n",
    };

    const manifest = buildKtManifestFromKnowledgePage(
      page,
      fileContents,
      [],
      5,
      [
        { path: "src/entry.ts", startLine: 1, endLine: 1, symbol: "start" },
        { path: "src/util.ts", startLine: 1, endLine: 1, symbol: "helper" },
      ],
    );

    const conceptScene = manifest.scenes.find((s) => s.type === "concept");
    expect(conceptScene).toBeDefined();
    expect(conceptScene?.segments).toHaveLength(2);
    expect(conceptScene?.segments?.[0].file_path).toBe("src/entry.ts");
  });

  it("skips the concept scene entirely when fewer than 2 hops resolve", () => {
    const fileContents = {
      "src/util.ts": "export function helper() {\n  return 1;\n}\n",
    };

    const manifest = buildKtManifestFromKnowledgePage(
      page,
      fileContents,
      [],
      5,
      [{ path: "src/util.ts", startLine: 1, endLine: 1, symbol: "helper" }],
    );

    expect(manifest.scenes.some((s) => s.type === "concept")).toBe(false);
  });
});
