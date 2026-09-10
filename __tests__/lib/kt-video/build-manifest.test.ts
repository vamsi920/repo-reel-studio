import { describe, expect, it } from "vitest";
import {
  buildKtManifest,
  buildKtManifestFromKnowledgePage,
} from "#/lib/kt-video/build-manifest";

const page = {
  id: "page-1",
  title: "Auth Flow",
  description: "How auth works.",
  relevantFiles: [{ path: "src/util.ts" }, { path: "src/entry.ts" }],
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

  it("caps a concept segment's code at what the frame can actually show", () => {
    // A CodeGraph line range can cover a whole file. ConceptPanel renders
    // every line it is handed, so an uncapped segment runs off the bottom of
    // the 1080px composition.
    const longFile = Array.from(
      { length: 200 },
      (_, i) => `const line${i} = ${i};`,
    ).join("\n");
    const fileContents = {
      "src/entry.ts": longFile,
      "src/util.ts": longFile,
    };

    const manifest = buildKtManifestFromKnowledgePage(
      page,
      fileContents,
      [],
      5,
      [
        { path: "src/entry.ts", startLine: 1, endLine: 200, symbol: "start" },
        { path: "src/util.ts", startLine: 10, endLine: 180, symbol: "helper" },
      ],
    );

    const concept = manifest.scenes.find((s) => s.type === "concept");
    const segments = concept?.segments ?? [];
    expect(segments).toHaveLength(2);
    for (const segment of segments) {
      expect(segment.code.split("\n").length).toBeLessThanOrEqual(18);
      // The reported range must match what is rendered, so the panel's line
      // numbers and the scene's citation stay a real, single range.
      expect(segment.end_line - segment.start_line + 1).toBe(
        segment.code.split("\n").length,
      );
    }
    expect(segments[1].start_line).toBe(10);
  });

  it("reports repo-tree files it cannot fit instead of clipping them silently", () => {
    const repoFiles = Array.from({ length: 25 }, (_, i) => `src/file-${i}.ts`);
    const fileContents = {
      "src/util.ts": "export function helper() {\n  return 1;\n}\n",
    };

    const manifest = buildKtManifestFromKnowledgePage(
      page,
      fileContents,
      repoFiles,
    );
    const tree = manifest.scenes.find((s) => s.type === "repo-tree");

    expect(tree?.tree_files).toHaveLength(16);
    expect(tree?.tree_overflow).toBe(9);
  });

  it("leaves no repo-tree overflow when every file fits", () => {
    const repoFiles = Array.from({ length: 4 }, (_, i) => `src/file-${i}.ts`);
    const manifest = buildKtManifestFromKnowledgePage(
      page,
      { "src/util.ts": "export function helper() {\n  return 1;\n}\n" },
      repoFiles,
    );
    const tree = manifest.scenes.find((s) => s.type === "repo-tree");

    expect(tree?.tree_files).toHaveLength(4);
    expect(tree?.tree_overflow).toBeUndefined();
  });
});

describe("buildKtManifest", () => {
  it("gives every one of the N allowed files its own code scene", () => {
    // The KT Video tab lets the user pick up to N files and passes that same
    // N as the cap. The cap used to reserve one slot for the intro, so the
    // eighth file a user picked never got a scene and nothing said so.
    const fileContents = Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [
        `src/mod${i}.ts`,
        `export function fn${i}() {\n  return ${i};\n}\n`.repeat(3),
      ]),
    );

    const manifest = buildKtManifest("repo", fileContents, 8);
    const codeScenes = manifest.scenes.filter((s) => s.type === "code");

    expect(codeScenes.map((s) => s.file_path).sort()).toEqual(
      Object.keys(fileContents).sort(),
    );
    expect(manifest.scenes[0].type).toBe("intro");
    expect(manifest.scenes[manifest.scenes.length - 1].type).toBe("recap");
  });

  it("still caps code scenes when more files than the cap are given", () => {
    const fileContents = Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [
        `src/mod${i}.ts`,
        `export function fn${i}() {\n  return ${i};\n}\n`.repeat(3),
      ]),
    );

    const manifest = buildKtManifest("repo", fileContents, 3);

    expect(manifest.scenes.filter((s) => s.type === "code")).toHaveLength(3);
  });

  it("never highlights a line past the 22-line window CodePanel actually renders", () => {
    // CodePanel shows a fixed 22-line window starting 3 lines above the
    // highlight's first line, so a highlight end more than 18 lines past its
    // start used to point at a line the video never displayed.
    const body = Array.from(
      { length: 40 },
      (_, i) => `  console.log(${i});`,
    ).join("\n");
    const fileContents = {
      "src/big.ts": `export function bigFn() {\n${body}\n}\n`,
    };

    const manifest = buildKtManifest("repo", fileContents, 1);
    const codeScene = manifest.scenes.find((s) => s.type === "code");

    const [start, end] = codeScene!.highlight_lines;
    expect(start).toBe(1);
    expect(end - start).toBeLessThanOrEqual(18);
  });

  it("does not let a highlight bleed into the next symbol's own line", () => {
    // Two adjacent one-line exports with no gap between them: the highlight
    // for the first must stop at its own last line, not spill onto the
    // second symbol's declaration line.
    const fileContents = {
      "src/adjacent.ts":
        "export function primaryFn() {}\nexport function otherFn() {}\n",
    };

    const manifest = buildKtManifest("repo", fileContents, 1);
    const codeScene = manifest.scenes.find((s) => s.type === "code");

    expect(codeScene!.highlight_lines).toEqual([1, 1]);
  });
});
