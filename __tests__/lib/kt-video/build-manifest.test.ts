import { describe, expect, it } from "vitest";
import {
  buildKtManifest,
  buildKtManifestFromKnowledgePage,
  isFileSceneEligible,
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

  it("adds a real diagram scene per page diagram, mapped to the right scene type, and skips the repo-tree scene when diagrams exist", () => {
    // Regression coverage: this path (buildDiagramScene, and the DIAGRAM_SCENE_TYPE
    // mapping + repo-tree-skip branch around it) had zero test coverage, even
    // though it's the primary path for any DeepWiki page that actually has
    // diagrams — a page with no diagrams is what the other repo-tree tests above
    // cover instead.
    const pageWithDiagrams = {
      ...page,
      diagrams: [
        { id: "d1", type: "architecture" as const, mermaid: "graph TD; A-->B" },
        { id: "d2", type: "dependency" as const, mermaid: "graph TD; C-->D" },
        { id: "d3", type: "flow" as const, mermaid: "graph TD; E-->F" },
        { id: "d4", type: "sequence" as const, mermaid: "sequenceDiagram" },
        { id: "d5", type: "other" as const, mermaid: "graph TD; G-->H" },
      ],
    };
    const repoFiles = ["src/util.ts", "src/entry.ts"];

    const manifest = buildKtManifestFromKnowledgePage(
      pageWithDiagrams,
      { "src/util.ts": "export function helper() {\n  return 1;\n}\n" },
      repoFiles,
    );

    const diagramScenes = manifest.scenes.filter((s) =>
      ["architecture", "flow", "diagram"].includes(s.type),
    );
    expect(diagramScenes.map((s) => s.type)).toEqual([
      "architecture", // architecture
      "architecture", // dependency
      "flow", // flow
      "flow", // sequence
      "diagram", // other
    ]);
    expect(diagramScenes.map((s) => s.mermaid)).toEqual(
      pageWithDiagrams.diagrams.map((d) => d.mermaid),
    );
    // A page with real diagrams doesn't also need the generic repo-tree
    // scene — the tree only fills in when there's nothing else to show.
    expect(manifest.scenes.some((s) => s.type === "repo-tree")).toBe(false);
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

  it("counts the intro's 'this walkthrough covers N files' against the files actually shown, not every file it was given", () => {
    // The intro scene's file count used to come from `Object.keys(fileContents)`
    // (every non-empty file handed to buildKtManifest) instead of the ranked/
    // capped list that actually gets a code scene, so a repo with more source
    // files than the cap overstated what the walkthrough covers.
    const fileContents = Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [
        `src/mod${i}.ts`,
        `export function fn${i}() {\n  return ${i};\n}\n`.repeat(3),
      ]),
    );

    const manifest = buildKtManifest("repo", fileContents, 3);
    const codeScenes = manifest.scenes.filter((s) => s.type === "code");
    const intro = manifest.scenes.find((s) => s.type === "intro");

    expect(codeScenes).toHaveLength(3);
    expect(intro!.narration_text).toContain("covers 3 files");
    expect(intro!.narration_text).not.toContain("covers 6 files");
  });

  it("disambiguates scene titles for same-named files in different directories", () => {
    // scene.title drops the directory (nameNoExt(path)), so two ranked files
    // that share a basename — extremely common (index.ts, utils.ts, ...) —
    // used to collide on the exact same title, making the on-screen badges
    // indistinguishable and the recap narration nonsensical ("...core files:
    // index and index.").
    const fileContents = {
      "src/components/index.ts":
        "export function renderComponents() {\n  return 1;\n}\n".repeat(3),
      "src/utils/index.ts":
        "export function computeUtils() {\n  return 2;\n}\n".repeat(3),
    };

    const manifest = buildKtManifest("repo", fileContents, 2);
    const codeScenes = manifest.scenes.filter((s) => s.type === "code");
    const titles = codeScenes.map((s) => s.title);

    expect(new Set(titles).size).toBe(titles.length);
    expect(titles.sort()).toEqual(["components/index", "utils/index"]);

    const recap = manifest.scenes.find((s) => s.type === "recap");
    expect(recap!.narration_text).not.toContain("index and index");
  });

  it("leaves a unique title untouched when no other scene collides", () => {
    const fileContents = {
      "src/components/index.ts":
        "export function renderComponents() {\n  return 1;\n}\n".repeat(3),
      "src/only-one.ts":
        "export function computeUtils() {\n  return 2;\n}\n".repeat(3),
    };

    const manifest = buildKtManifest("repo", fileContents, 2);
    const codeScenes = manifest.scenes.filter((s) => s.type === "code");

    expect(codeScenes.map((s) => s.title).sort()).toEqual([
      "index",
      "only-one",
    ]);
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

  it("does not crown an empty stub class as the file's primary symbol over a real function", () => {
    // An earlier class with only a docstring and `pass` has no real logic in
    // it, so a later function that actually does something should be named
    // "the heart of this file" instead — not whichever symbol appears first.
    const fileContents = {
      "src/report_builder.py":
        'DEFAULT_TITLE = "Report"\n' +
        "\n" +
        "class ReportSection:\n" +
        '    """A section placeholder."""\n' +
        "    pass\n" +
        "\n" +
        "def build_final_report(rows, title=DEFAULT_TITLE):\n" +
        '    return f"{title}: {len(rows)} rows"\n',
    };

    const manifest = buildKtManifest("repo", fileContents, 1);
    const codeScene = manifest.scenes.find((s) => s.type === "code");

    expect(codeScene!.narration_text).toContain(
      "The heart of this file is build_final_report",
    );
    expect(codeScene!.narration_text).not.toContain(
      "The heart of this file is ReportSection",
    );
  });

  it("does not crown an empty default-exported class stub over a real named export", () => {
    // `export default class` and `export default function` both collapse to
    // `kind: "default"` in extractSymbols, and pickPrimary used to return
    // whichever `default` symbol it found without ever checking whether its
    // body was trivial — so an empty default-exported marker class always
    // outranked a real function declared later in the same file.
    const fileContents = {
      "src/marker.ts":
        "export default class EmptyStub {\n" +
        "  // just a marker, no real logic\n" +
        "}\n" +
        "\n" +
        "export function computeTotal(items: number[]) {\n" +
        "  return items.reduce((sum, item) => sum + item, 0);\n" +
        "}\n",
    };

    const manifest = buildKtManifest("repo", fileContents, 1);
    const codeScene = manifest.scenes.find((s) => s.type === "code");

    expect(codeScene!.narration_text).toContain(
      "The heart of this file is computeTotal",
    );
    expect(codeScene!.narration_text).not.toContain(
      "The heart of this file is EmptyStub",
    );
  });

  it("recognizes Kotlin's `fun` keyword as a function symbol", () => {
    // Regression test: the shared rs/java/cs/kt/swift/scala/rb/php/c/cc/cpp
    // extractor only matched `fn`/`func`/`def`/`function`, so every Kotlin
    // file's functions (declared with `fun`, not any of those) were
    // invisible to pickPrimary — a Kotlin file's "heart of this file" line
    // silently fell back to the no-symbols-found branch even when the file
    // plainly had a real function.
    const fileContents = {
      "src/Greeter.kt":
        "package com.example\n" +
        "\n" +
        "fun greet(name: String): String {\n" +
        '    return "Hello, $name"\n' +
        "}\n",
    };

    const manifest = buildKtManifest("repo", fileContents, 1);
    const codeScene = manifest.scenes.find((s) => s.type === "code");

    expect(codeScene!.narration_text).toContain(
      "The heart of this file is greet",
    );
    expect(codeScene!.focus_symbols).toContain("greet");
  });
});

describe("isFileSceneEligible", () => {
  // The KT Video sidebar flags a selected file as "unavailable" using this
  // same function, so it must exactly match buildKtManifest's own filter or
  // a file can look normally selected while silently getting no scene.
  const longEnough = "export function fn() {\n  return 1;\n}\n".repeat(2);

  it("accepts a real source file with enough content", () => {
    expect(isFileSceneEligible("src/mod.ts", longEnough)).toBe(true);
  });

  it("rejects content under the 40-character minimum", () => {
    expect(isFileSceneEligible("src/mod.ts", "const x = 1;")).toBe(false);
  });

  it("rejects an ignored path even with enough content", () => {
    expect(isFileSceneEligible("node_modules/pkg/index.ts", longEnough)).toBe(
      false,
    );
  });

  it("rejects a noise file (lockfile) even with enough content", () => {
    expect(isFileSceneEligible("package-lock.json", longEnough)).toBe(false);
  });

  it("rejects a non-source extension that isn't a README", () => {
    expect(isFileSceneEligible("config/app.yaml", longEnough)).toBe(false);
  });

  it("accepts a README even though .md isn't a source extension", () => {
    expect(isFileSceneEligible("README.md", longEnough)).toBe(true);
  });
});
