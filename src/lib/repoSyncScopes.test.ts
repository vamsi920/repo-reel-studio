import { describe, expect, it } from "vitest";

import {
  anchorPathsFromChangedList,
  collectSceneFilePaths,
  expandPathsWithImportNeighbors,
  expandRefreshPathSeeds,
  pathsFromCompareFiles,
  pickSceneIdsAffectedByChanges,
} from "@/lib/repoSyncScopes";
import type { VideoManifest, VideoScene } from "@/lib/types";

const scene = (id: number, filePath: string, repoMapPaths: string[] = []): VideoScene =>
  ({
    id,
    type: "code",
    file_path: filePath,
    narration_text: `scene ${id}`,
    duration_seconds: 5,
    title: `scene ${id}`,
    repo_map_paths: repoMapPaths,
  }) as VideoScene;

const manifest = (scenes: VideoScene[]): VideoManifest => ({ title: "demo", scenes });

describe("pathsFromCompareFiles", () => {
  it("collects current and previous filenames, deduped and normalized", () => {
    const paths = pathsFromCompareFiles([
      { filename: "src\\lib\\a.ts", status: "modified" },
      { filename: "/src/lib/b.ts", previous_filename: "src/lib/old-b.ts", status: "renamed" },
      { filename: "src/lib/a.ts", status: "modified" },
      { filename: "", previous_filename: null },
    ]);

    expect(paths).toEqual(["src/lib/a.ts", "src/lib/b.ts", "src/lib/old-b.ts"]);
  });

  it("returns an empty list when nothing changed", () => {
    expect(pathsFromCompareFiles([])).toEqual([]);
  });
});

describe("anchorPathsFromChangedList", () => {
  it("anchors readme and root manifest files only", () => {
    const anchors = anchorPathsFromChangedList([
      "README.md",
      "docs/readme.rst",
      "package.json",
      "pyproject.toml",
      "src/lib/utils.ts",
      "src/package.jsonc",
      "",
    ]);

    expect(anchors).toEqual(["README.md", "docs/readme.rst", "package.json", "pyproject.toml"]);
  });
});

describe("expandPathsWithImportNeighbors", () => {
  it("normalizes seeds and drops empties without a graph", () => {
    expect(expandPathsWithImportNeighbors(null, ["\\src\\a.ts", "/src/b.ts", " ", "src/a.ts"])).toEqual([
      "src/a.ts",
      "src/b.ts",
    ]);
  });
});

describe("pickSceneIdsAffectedByChanges", () => {
  it("matches scenes on primary path or repo map paths", () => {
    const m = manifest([
      scene(1, "src/a.ts"),
      scene(2, "src/b.ts", ["src/shared/util.ts"]),
      scene(3, "src/c.ts", ["src/other.ts"]),
    ]);

    expect(pickSceneIdsAffectedByChanges(m, ["/src/a.ts", "src/shared/util.ts"])).toEqual([1, 2]);
  });

  it("dedupes ids and ignores blank changed paths", () => {
    const m = manifest([scene(1, "src/a.ts", ["src/a.ts"])]);
    expect(pickSceneIdsAffectedByChanges(m, ["src/a.ts", "src/a.ts", ""])).toEqual([1]);
  });

  it("returns nothing without a manifest or scenes", () => {
    expect(pickSceneIdsAffectedByChanges(null, ["src/a.ts"])).toEqual([]);
    expect(pickSceneIdsAffectedByChanges(manifest([]), ["src/a.ts"])).toEqual([]);
  });
});

describe("collectSceneFilePaths", () => {
  it("collects normalized scene and repo map paths", () => {
    const set = collectSceneFilePaths(
      manifest([scene(1, "/src/a.ts", ["src\\shared/util.ts"]), scene(2, "src/a.ts")])
    );

    expect([...set].sort()).toEqual(["src/a.ts", "src/shared/util.ts"]);
  });

  it("returns an empty set for a missing manifest", () => {
    expect(collectSceneFilePaths(undefined).size).toBe(0);
  });
});

describe("expandRefreshPathSeeds", () => {
  it("normalizes and dedupes compare paths", () => {
    expect(
      expandRefreshPathSeeds(["/src/a.ts", "src\\a.ts", "src/b.ts", ""], manifest([scene(1, "src/a.ts")]), null)
    ).toEqual(["src/a.ts", "src/b.ts"]);
  });
});
