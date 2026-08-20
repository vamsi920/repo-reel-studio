import { beforeEach, describe, expect, it } from "vitest";
import {
  selectCurrentLevel,
  selectVisibleNodes,
  useCodeGraphStore,
} from "#/stores/codegraph-store";
import type {
  AnalysisHandle,
  CodeGraphLevelPayload,
} from "#/lib/codegraph/analyzer-runner";
import type {
  CodeGraphMeta,
  CodeGraphNode,
} from "#/lib/codegraph/codegraph-types";

const WORKSPACE = "/workspace/acme";
const REPOSITORY = "acme/app";
const COMMIT = "abc1234";

function node(id: string, type = "file"): CodeGraphNode {
  return {
    id,
    level: "unit",
    type,
    name: id,
    summary: "",
    complexity: "simple",
    tags: [],
    childCount: 0,
    filePaths: [],
  };
}

function level(
  parentId: string | null,
  nodes: CodeGraphNode[],
): CodeGraphLevelPayload {
  return {
    parentId,
    nodes,
    edges: [],
    crumbs: [{ id: null, name: "System" }],
  };
}

const META: CodeGraphMeta = {
  workspaceId: WORKSPACE,
  repositoryId: REPOSITORY,
  commitSha: COMMIT,
  generatedAt: "2026-01-01T00:00:00.000Z",
  fileCount: 2,
  symbolCount: 3,
  languages: ["typescript"],
  frameworks: [],
};

function handle(root: CodeGraphLevelPayload): AnalysisHandle {
  return {
    meta: META,
    root,
    loadLevel: async () => null,
    loadSearchIndex: async () => [],
    readSource: async () => null,
  };
}

function start(): string {
  return useCodeGraphStore.getState().start({
    workspaceId: WORKSPACE,
    repositoryId: REPOSITORY,
    commitSha: COMMIT,
  });
}

describe("codegraph store", () => {
  beforeEach(() => {
    useCodeGraphStore.setState({ byKey: {}, handles: {} });
  });

  it("keys state by workspace, repository and commit together", () => {
    const key = start();

    expect(key).toBe(`${WORKSPACE}::${REPOSITORY}::${COMMIT}`);

    // The same repository at a different commit is a different graph, never an
    // update of the existing one.
    const other = useCodeGraphStore.getState().start({
      workspaceId: WORKSPACE,
      repositoryId: REPOSITORY,
      commitSha: "def5678",
    });

    expect(other).not.toBe(key);
    expect(Object.keys(useCodeGraphStore.getState().byKey)).toHaveLength(2);
  });

  it("always opens on the system view when a graph becomes ready", () => {
    const key = start();
    const root = level(null, [node("a"), node("b")]);

    useCodeGraphStore.getState().setReady(key, handle(root));
    const state = useCodeGraphStore.getState().byKey[key];

    expect(state.status).toBe("ready");
    expect(state.currentParentId).toBeNull();
    expect(selectCurrentLevel(state)).toEqual(root);
    expect(state.meta).toEqual(META);
  });

  it("caches a fetched level and navigates into it", () => {
    const key = start();
    useCodeGraphStore
      .getState()
      .setReady(key, handle(level(null, [node("sub")])));

    const child = level("sub", [node("x"), node("y")]);
    useCodeGraphStore.getState().beginLoadLevel(key, "sub");
    useCodeGraphStore.getState().setLevel(key, "sub", child);
    useCodeGraphStore.getState().navigateTo(key, "sub");

    const state = useCodeGraphStore.getState().byKey[key];
    expect(state.loadingParents).toEqual([]);
    expect(selectCurrentLevel(state)).toEqual(child);
  });

  it("does not queue the same level twice", () => {
    const key = start();
    useCodeGraphStore.getState().beginLoadLevel(key, "sub");
    useCodeGraphStore.getState().beginLoadLevel(key, "sub");

    expect(useCodeGraphStore.getState().byKey[key].loadingParents).toEqual([
      "sub",
    ]);
  });

  it("clears the pending flag when a level fails to load", () => {
    const key = start();
    useCodeGraphStore.getState().beginLoadLevel(key, "sub");
    useCodeGraphStore.getState().failLevel(key, "sub");

    expect(useCodeGraphStore.getState().byKey[key].loadingParents).toEqual([]);
  });

  it("clears the selection when navigating, so stale details cannot linger", () => {
    const key = start();
    useCodeGraphStore
      .getState()
      .setReady(key, handle(level(null, [node("a")])));
    useCodeGraphStore.getState().selectNode(key, "a");
    useCodeGraphStore.getState().navigateTo(key, "sub");

    expect(useCodeGraphStore.getState().byKey[key].selectedNodeId).toBeNull();
  });

  it("filters visible nodes by type without discarding the cached level", () => {
    const key = start();
    useCodeGraphStore
      .getState()
      .setReady(
        key,
        handle(level(null, [node("a", "file"), node("b", "class")])),
      );

    useCodeGraphStore.getState().toggleType(key, "class");
    const state = useCodeGraphStore.getState().byKey[key];

    expect(selectVisibleNodes(state).map((n) => n.id)).toEqual(["a"]);
    expect(selectCurrentLevel(state)!.nodes).toHaveLength(2);

    useCodeGraphStore.getState().toggleType(key, "class");
    expect(
      selectVisibleNodes(useCodeGraphStore.getState().byKey[key]),
    ).toHaveLength(2);
  });

  it("records errors without pretending a graph is available", () => {
    const key = start();
    useCodeGraphStore
      .getState()
      .setError(key, "preflight: node is not available");

    const state = useCodeGraphStore.getState().byKey[key];
    expect(state.status).toBe("error");
    expect(state.meta).toBeNull();
  });

  it("ignores updates for a key that no longer exists", () => {
    expect(() =>
      useCodeGraphStore.getState().selectNode("missing::key::sha", "a"),
    ).not.toThrow();
  });

  it("drops both state and handle on reset", () => {
    const key = start();
    useCodeGraphStore.getState().setReady(key, handle(level(null, [])));
    useCodeGraphStore.getState().reset(key);

    expect(useCodeGraphStore.getState().byKey[key]).toBeUndefined();
    expect(useCodeGraphStore.getState().handles[key]).toBeUndefined();
  });

  it("returns no visible nodes before a level has loaded", () => {
    expect(selectVisibleNodes(undefined)).toEqual([]);
    expect(selectCurrentLevel(undefined)).toBeUndefined();
  });
});
