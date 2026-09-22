import { describe, expect, it, vi } from "vitest";
import { findConceptFlow } from "#/lib/kt-video/concept-flow";
import type {
  AnalysisHandle,
  CodeGraphLevelPayload,
} from "#/lib/codegraph/analyzer-runner";
import type {
  CodeGraphMeta,
  CodeGraphNode,
} from "#/lib/codegraph/codegraph-types";

const META: CodeGraphMeta = {
  workspaceId: "workspace-1",
  repositoryId: "acme/widgets",
  commitSha: "abc123",
  generatedAt: new Date().toISOString(),
  fileCount: 2,
  symbolCount: 2,
  languages: ["typescript"],
  frameworks: [],
};

function node(
  overrides: Partial<CodeGraphNode> & { id: string },
): CodeGraphNode {
  return {
    level: "unit",
    type: "module",
    name: overrides.id,
    summary: "",
    complexity: "simple",
    tags: [],
    childCount: 0,
    filePaths: [],
    ...overrides,
  };
}

function level(
  overrides: Partial<CodeGraphLevelPayload> = {},
): CodeGraphLevelPayload {
  return { parentId: null, nodes: [], edges: [], crumbs: [], ...overrides };
}

function handleFor(
  root: CodeGraphLevelPayload,
  loadLevel: AnalysisHandle["loadLevel"] = async () => null,
): AnalysisHandle {
  return {
    meta: META,
    root,
    loadLevel,
    loadSearchIndex: async () => [],
    readSource: async () => null,
  };
}

describe("findConceptFlow", () => {
  it("returns nothing when there are no relevant files to overlap", async () => {
    const handle = handleFor(level());
    expect(await findConceptFlow(handle, [])).toEqual([]);
  });

  it("walks a real edge between two concrete nodes already at the root level", async () => {
    const a = node({
      id: "a",
      level: "symbol",
      name: "start",
      filePath: "src/entry.ts",
      lineRange: [1, 5],
    });
    const b = node({
      id: "b",
      level: "symbol",
      name: "helper",
      filePath: "src/util.ts",
      lineRange: [10, 20],
    });
    const root = level({
      nodes: [a, b],
      edges: [{ source: "a", target: "b", type: "calls", weight: 1 }],
    });
    const handle = handleFor(root);

    const hops = await findConceptFlow(handle, ["src/entry.ts", "src/util.ts"]);

    expect(hops).toEqual([
      { path: "src/entry.ts", startLine: 1, endLine: 5, symbol: "start" },
      { path: "src/util.ts", startLine: 10, endLine: 20, symbol: "helper" },
    ]);
  });

  it("drills into the best-overlapping aggregate node until it finds concrete nodes", async () => {
    const aggregate = node({
      id: "agg",
      level: "subsystem",
      childCount: 2,
      filePaths: ["src/entry.ts", "src/util.ts"],
    });
    const root = level({ nodes: [aggregate], edges: [] });

    const a = node({
      id: "a",
      level: "symbol",
      name: "start",
      filePath: "src/entry.ts",
      lineRange: [1, 5],
    });
    const b = node({
      id: "b",
      level: "symbol",
      name: "helper",
      filePath: "src/util.ts",
      lineRange: [10, 20],
    });
    const child = level({
      parentId: "agg",
      nodes: [a, b],
      edges: [{ source: "a", target: "b", type: "calls", weight: 1 }],
    });

    const loadLevel = vi.fn(async (id: string) =>
      id === "agg" ? child : null,
    );
    const handle = handleFor(root, loadLevel);

    const hops = await findConceptFlow(handle, ["src/entry.ts", "src/util.ts"]);

    expect(loadLevel).toHaveBeenCalledWith("agg");
    expect(hops.map((h) => h.path)).toEqual(["src/entry.ts", "src/util.ts"]);
  });

  it("drills into whichever aggregate overlaps the most files, not just the first one", async () => {
    // Regression coverage for the candidate sort in findConceptFlow: with
    // more than one aggregate node to choose from, it must drill into the
    // one with the most files in common with the page, not whichever
    // appears first in `matched`.
    const weak = node({
      id: "weak",
      level: "subsystem",
      childCount: 1,
      filePaths: ["src/entry.ts"],
    });
    const strong = node({
      id: "strong",
      level: "subsystem",
      childCount: 2,
      filePaths: ["src/entry.ts", "src/util.ts"],
    });
    const root = level({ nodes: [weak, strong], edges: [] });

    const a = node({
      id: "a",
      level: "symbol",
      name: "start",
      filePath: "src/entry.ts",
      lineRange: [1, 5],
    });
    const b = node({
      id: "b",
      level: "symbol",
      name: "helper",
      filePath: "src/util.ts",
      lineRange: [10, 20],
    });
    const child = level({
      parentId: "strong",
      nodes: [a, b],
      edges: [{ source: "a", target: "b", type: "calls", weight: 1 }],
    });

    const loadLevel = vi.fn(async (id: string) =>
      id === "strong" ? child : null,
    );
    const handle = handleFor(root, loadLevel);

    const hops = await findConceptFlow(handle, ["src/entry.ts", "src/util.ts"]);

    expect(loadLevel).toHaveBeenCalledWith("strong");
    expect(loadLevel).not.toHaveBeenCalledWith("weak");
    expect(hops.map((h) => h.path)).toEqual(["src/entry.ts", "src/util.ts"]);
  });

  it("returns nothing when the overlapping nodes have no real edge between them", async () => {
    const a = node({
      id: "a",
      level: "symbol",
      name: "start",
      filePath: "src/entry.ts",
      lineRange: [1, 5],
    });
    const b = node({
      id: "b",
      level: "symbol",
      name: "helper",
      filePath: "src/util.ts",
      lineRange: [10, 20],
    });
    const root = level({ nodes: [a, b], edges: [] });
    const handle = handleFor(root);

    expect(
      await findConceptFlow(handle, ["src/entry.ts", "src/util.ts"]),
    ).toEqual([]);
  });

  it("stops drilling and returns nothing once there is no further aggregate to expand", async () => {
    const aggregate = node({
      id: "agg",
      level: "subsystem",
      childCount: 0,
      filePaths: ["src/entry.ts"],
    });
    const root = level({ nodes: [aggregate], edges: [] });
    const loadLevel = vi.fn(async () => null);
    const handle = handleFor(root, loadLevel);

    expect(await findConceptFlow(handle, ["src/entry.ts"])).toEqual([]);
    expect(loadLevel).not.toHaveBeenCalled();
  });

  it("never fabricates a chain when a level fails to load", async () => {
    const aggregate = node({
      id: "agg",
      level: "subsystem",
      childCount: 2,
      filePaths: ["src/entry.ts", "src/util.ts"],
    });
    const root = level({ nodes: [aggregate], edges: [] });
    const handle = handleFor(root, async () => null);

    expect(
      await findConceptFlow(handle, ["src/entry.ts", "src/util.ts"]),
    ).toEqual([]);
  });

  it("swallows a thrown error from a malformed handle instead of crashing the caller", async () => {
    const aggregate = node({
      id: "agg",
      level: "subsystem",
      childCount: 1,
      filePaths: ["src/entry.ts"],
    });
    const handle: AnalysisHandle = {
      ...handleFor(level({ nodes: [aggregate] })),
      loadLevel: async () => {
        throw new Error("network down");
      },
    };

    expect(await findConceptFlow(handle, ["src/entry.ts"])).toEqual([]);
  });

  it("caps the walked chain at MAX_HOPS even when more real edges are available", async () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const nodes = ids.map((id) =>
      node({
        id,
        level: "symbol",
        name: id,
        filePath: `src/${id}.ts`,
        lineRange: [1, 5],
      }),
    );
    const edges = ids.slice(0, -1).map((id, i) => ({
      source: id,
      target: ids[i + 1],
      type: "calls",
      weight: 1,
    }));
    const root = level({ nodes, edges });
    const handle = handleFor(root);

    const hops = await findConceptFlow(
      handle,
      ids.map((id) => `src/${id}.ts`),
    );

    expect(hops).toHaveLength(4);
    expect(hops.map((h) => h.path)).toEqual([
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
      "src/d.ts",
    ]);
  });
});
