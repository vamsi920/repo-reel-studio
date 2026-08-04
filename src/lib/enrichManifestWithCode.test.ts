import { describe, expect, it } from "vitest";

import { enrichManifestWithCode, generatePlaceholderCode } from "@/lib/enrichManifestWithCode";
import type { VideoManifest, VideoScene } from "@/lib/types";

const scene = (id: number, filePath: string, code?: string): VideoScene =>
  ({
    id,
    type: "code",
    file_path: filePath,
    narration_text: `scene ${id}`,
    duration_seconds: 5,
    title: `scene ${id}`,
    code,
  }) as VideoScene;

const manifest = (scenes: VideoScene[], repoFiles?: string[]): VideoManifest => ({
  title: "demo",
  scenes,
  repo_files: repoFiles,
});

describe("generatePlaceholderCode", () => {
  it("never fabricates code", () => {
    expect(generatePlaceholderCode(scene(1, "src/a.ts"))).toBe("");
  });
});

describe("enrichManifestWithCode", () => {
  it("attaches exact-match file contents", () => {
    const result = enrichManifestWithCode(manifest([scene(1, "src/a.ts")]), {
      "src/a.ts": "export const a = 1;",
    });

    expect(result.scenes[0].code).toBe("export const a = 1;");
    expect(result.repo_files).toEqual(["src/a.ts"]);
  });

  it("resolves paths that differ by a leading ./ or /", () => {
    const result = enrichManifestWithCode(manifest([scene(1, "./src/a.ts")]), {
      "/src/a.ts": "export const a = 1;",
    });

    expect(result.scenes[0].code).toBe("export const a = 1;");
  });

  it("resolves a scene path that is a suffix of a repo path", () => {
    const result = enrichManifestWithCode(manifest([scene(1, "lib/a.ts")]), {
      "repo/src/lib/a.ts": "export const a = 1;",
    });

    expect(result.scenes[0].code).toBe("export const a = 1;");
  });

  it("resolves by unique basename", () => {
    const result = enrichManifestWithCode(manifest([scene(1, "a.ts")]), {
      "src/deep/a.ts": "export const a = 1;",
      "src/other/b.ts": "export const b = 2;",
    });

    expect(result.scenes[0].code).toBe("export const a = 1;");
  });

  it("takes the first suffix match when several files share a basename", () => {
    const result = enrichManifestWithCode(manifest([scene(1, "a.ts")]), {
      "src/one/a.ts": "one",
      "src/two/a.ts": "two",
    });

    expect(result.scenes[0].code).toBe("one");
  });

  it("leaves code empty when several files ambiguously contain the scene path", () => {
    const result = enrichManifestWithCode(manifest([scene(1, "lib")]), {
      "src/lib/one.ts": "one",
      "src/lib/two.ts": "two",
    });

    expect(result.scenes[0].code).toBe("");
  });

  it("keeps existing real code when the file cannot be resolved", () => {
    const result = enrichManifestWithCode(manifest([scene(1, "missing.ts", "const kept = true;")]), {
      "src/a.ts": "export const a = 1;",
    });

    expect(result.scenes[0].code).toBe("const kept = true;");
  });

  it("prefers real file content over pre-attached code", () => {
    const result = enrichManifestWithCode(manifest([scene(1, "src/a.ts", "stale")]), {
      "src/a.ts": "export const a = 1;",
    });

    expect(result.scenes[0].code).toBe("export const a = 1;");
  });

  it("empties whitespace-only existing code when nothing resolves", () => {
    const result = enrichManifestWithCode(manifest([scene(1, "missing.ts", "   ")]), {});

    expect(result.scenes[0].code).toBe("");
  });

  it("keeps manifest repo_files when no file contents are supplied", () => {
    const result = enrichManifestWithCode(manifest([scene(1, "src/a.ts")], ["src/a.ts", "src/b.ts"]), {});

    expect(result.repo_files).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.scenes[0].code).toBe("");
  });

  it("does not mutate the input manifest", () => {
    const input = manifest([scene(1, "src/a.ts")]);
    enrichManifestWithCode(input, { "src/a.ts": "export const a = 1;" });

    expect(input.scenes[0].code).toBeUndefined();
  });
});
