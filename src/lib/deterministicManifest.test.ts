import { describe, expect, it } from "vitest";

import { buildDeterministicManifest } from "@/lib/deterministicManifest";
import type { GitNexusGraphData } from "@/lib/types";

const body = (prefix: string, lines: number) =>
  Array.from({ length: lines }, (_, i) => `${prefix} line ${i};`).join("\n");

const fileContents: Record<string, string> = {
  "src/main.ts": [
    "import { createServer } from './server/server';",
    "import { format } from './utils/format';",
    "",
    "export function bootstrap() {",
    "  return createServer(format('ok'));",
    "}",
    body("// main", 30),
  ].join("\n"),
  "src/server/server.ts": [
    "export class Server {",
    "  start() {",
    "    return true;",
    "  }",
    "}",
    body("// server", 40),
  ].join("\n"),
  "src/utils/format.ts": ["export const format = (value: string) => value.trim();", body("// fmt", 20)].join("\n"),
  "README.md": ["# demo", "", "A demo repository used in tests.", body("docs", 10)].join("\n"),
  "src/utils/format.test.ts": ["import { format } from './format';", body("// test", 20)].join("\n"),
  "package-lock.json": body("// lock", 50),
  "src/types.d.ts": body("// types", 50),
  "node_modules/dep/index.ts": body("// dep", 50),
  "src/empty.ts": "// tiny",
};

const graph = {
  nodes: [],
  edges: [],
  clusters: [],
  processes: [],
  summary: {
    repoName: "demo",
    totalFiles: 4,
    totalSymbols: 3,
    totalEdges: 2,
    languages: { TypeScript: 4 },
    entryPoints: ["src/main.ts"],
    hubFiles: ["src/server/server.ts"],
  },
} as unknown as GitNexusGraphData;

describe("buildDeterministicManifest", () => {
  it("builds an intro, file scenes and a recap with sequential ids", () => {
    const manifest = buildDeterministicManifest("demo", fileContents, graph);

    expect(manifest.title).toBe("demo — Code Walkthrough");
    expect(manifest.pipeline_version).toBe("deterministic");
    expect(manifest.repo_files).toEqual(Object.keys(fileContents));
    expect(manifest.scenes[0].type).toBe("intro");
    expect(manifest.scenes.at(-1)?.narration_text.length).toBeGreaterThan(0);
    expect(manifest.scenes.map((scene) => scene.id)).toEqual(
      manifest.scenes.map((_, index) => index + 1)
    );
  });

  it("only narrates real repository files and never fabricates code", () => {
    const manifest = buildDeterministicManifest("demo", fileContents, graph);

    for (const scene of manifest.scenes) {
      if (!fileContents[scene.file_path]) continue;
      expect(fileContents[scene.file_path]).toContain(scene.code?.split("\n")[0] ?? "");
    }
  });

  it("skips lockfiles, type declarations, vendored and near-empty files", () => {
    const paths = new Set(
      buildDeterministicManifest("demo", fileContents, graph).scenes.map((scene) => scene.file_path)
    );

    expect(paths.has("package-lock.json")).toBe(false);
    expect(paths.has("src/types.d.ts")).toBe(false);
    expect(paths.has("node_modules/dep/index.ts")).toBe(false);
    expect(paths.has("src/empty.ts")).toBe(false);
    expect(paths.has("src/main.ts")).toBe(true);
  });

  it("respects maxFileScenes and the intro/summary switches", () => {
    const manifest = buildDeterministicManifest("demo", fileContents, graph, {
      title: "Custom title",
      maxFileScenes: 2,
      includeIntro: false,
      includeSummary: false,
    });

    expect(manifest.title).toBe("Custom title");
    expect(manifest.scenes).toHaveLength(2);
    expect(manifest.scenes.every((scene) => scene.type !== "intro")).toBe(true);
  });

  it("backs every sentence with source refs inside the real file bounds", () => {
    const manifest = buildDeterministicManifest("demo", fileContents, graph, { maxFileScenes: 3 });

    for (const scene of manifest.scenes) {
      for (const evidence of scene.sentence_evidence ?? []) {
        expect(evidence.sentence.trim().length).toBeGreaterThan(0);
        for (const ref of evidence.source_refs ?? []) {
          const lineCount = (fileContents[ref.file_path] ?? "").split("\n").length;
          expect(lineCount).toBeGreaterThan(0);
          expect(ref.start_line).toBeGreaterThanOrEqual(1);
          expect(ref.end_line).toBeGreaterThanOrEqual(ref.start_line);
          expect(ref.end_line).toBeLessThanOrEqual(lineCount);
        }
      }
    }
  });

  it("gives every scene a readable duration", () => {
    const manifest = buildDeterministicManifest("demo", fileContents, graph);

    manifest.scenes.forEach((scene) => {
      expect(scene.duration_seconds).toBeGreaterThanOrEqual(9);
      expect(scene.title.length).toBeGreaterThan(0);
    });
  });

  it("works without graph data", () => {
    const manifest = buildDeterministicManifest("demo", fileContents);

    expect(manifest.scenes.length).toBeGreaterThan(1);
  });

  it("falls back to a single honest scene when no file is usable", () => {
    const manifest = buildDeterministicManifest("demo", { "notes.txt": "hello" });

    expect(manifest.scenes).toHaveLength(1);
    expect(manifest.scenes[0].type).toBe("intro");
    expect(manifest.scenes[0].file_path).toBe("notes.txt");
    expect(manifest.scenes[0].code).toBe("hello");
  });

  it("handles a completely empty repository", () => {
    const manifest = buildDeterministicManifest("demo", {});

    expect(manifest.scenes).toHaveLength(1);
    expect(manifest.scenes[0].file_path).toBe("repository");
    expect(manifest.scenes[0].sentence_evidence).toEqual([]);
  });
});
