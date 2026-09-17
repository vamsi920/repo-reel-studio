import { beforeEach, describe, expect, it } from "vitest";
import {
  selectCurrentLevel,
  selectHiddenTypes,
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

  it("remembers which level failed so the UI can say so and offer a retry", () => {
    const key = start();
    useCodeGraphStore.getState().beginLoadLevel(key, "sub");
    useCodeGraphStore.getState().failLevel(key, "sub");

    expect(useCodeGraphStore.getState().byKey[key].levelError).toBe("sub");
  });

  it("clears the failure once the same level is retried or arrives", () => {
    const key = start();
    useCodeGraphStore.getState().failLevel(key, "sub");
    useCodeGraphStore.getState().beginLoadLevel(key, "sub");
    expect(useCodeGraphStore.getState().byKey[key].levelError).toBeNull();

    useCodeGraphStore.getState().failLevel(key, "sub");
    useCodeGraphStore.getState().setLevel(key, "sub", level("sub", []));
    expect(useCodeGraphStore.getState().byKey[key].levelError).toBeNull();
  });

  it("clears a stale failure when a different level starts loading", () => {
    const key = start();
    useCodeGraphStore.getState().failLevel(key, "a");
    expect(useCodeGraphStore.getState().byKey[key].levelError).toBe("a");

    useCodeGraphStore.getState().beginLoadLevel(key, "b");
    expect(useCodeGraphStore.getState().byKey[key].levelError).toBeNull();
  });

  it("clears the failure when the user navigates elsewhere", () => {
    const key = start();
    useCodeGraphStore.getState().failLevel(key, "sub");
    useCodeGraphStore.getState().navigateTo(key, null);

    expect(useCodeGraphStore.getState().byKey[key].levelError).toBeNull();
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

  it("keeps a type filter on the level it was set on, not on every level", () => {
    const key = start();
    useCodeGraphStore
      .getState()
      .setReady(key, handle(level(null, [node("sub", "subsystem")])));
    useCodeGraphStore
      .getState()
      .setLevel(
        key,
        "sub",
        level("sub", [node("f", "file"), node("d", "folder")]),
      );
    useCodeGraphStore
      .getState()
      .setLevel(key, "other", level("other", [node("g", "file")]));

    // Hide "file" inside one folder…
    useCodeGraphStore.getState().navigateTo(key, "sub");
    useCodeGraphStore.getState().toggleType(key, "file");
    let state = useCodeGraphStore.getState().byKey[key];
    expect(selectHiddenTypes(state)).toEqual(["file"]);
    expect(selectVisibleNodes(state).map((n) => n.id)).toEqual(["d"]);

    // …Back to the system level: nothing is hidden there, so the badge has
    // nothing to count and the node count stays honest.
    useCodeGraphStore.getState().navigateTo(key, null);
    state = useCodeGraphStore.getState().byKey[key];
    expect(selectHiddenTypes(state)).toEqual([]);
    expect(selectVisibleNodes(state)).toHaveLength(1);

    // A sibling folder the user never filtered shows all of its files.
    useCodeGraphStore.getState().navigateTo(key, "other");
    state = useCodeGraphStore.getState().byKey[key];
    expect(selectHiddenTypes(state)).toEqual([]);
    expect(selectVisibleNodes(state).map((n) => n.id)).toEqual(["g"]);

    // Returning to the filtered folder finds the filter where it was left.
    useCodeGraphStore.getState().navigateTo(key, "sub");
    state = useCodeGraphStore.getState().byKey[key];
    expect(selectHiddenTypes(state)).toEqual(["file"]);
    expect(selectVisibleNodes(state).map((n) => n.id)).toEqual(["d"]);
  });

  it("drops every type filter when the graph is rebuilt", () => {
    const key = start();
    useCodeGraphStore
      .getState()
      .setReady(key, handle(level(null, [node("a", "file")])));
    useCodeGraphStore.getState().toggleType(key, "file");
    expect(selectHiddenTypes(useCodeGraphStore.getState().byKey[key])).toEqual([
      "file",
    ]);

    useCodeGraphStore
      .getState()
      .setReady(key, handle(level(null, [node("b", "file")])));
    const state = useCodeGraphStore.getState().byKey[key];
    expect(selectHiddenTypes(state)).toEqual([]);
    expect(selectVisibleNodes(state)).toHaveLength(1);
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

  it("keeps the graph on screen while a forced rebuild runs", () => {
    const key = start();
    const root = level(null, [node("a")]);
    useCodeGraphStore.getState().setReady(key, handle(root));

    useCodeGraphStore.getState().beginRebuild(key);
    const state = useCodeGraphStore.getState().byKey[key];

    expect(state.rebuilding).toBe(true);
    expect(state.status).toBe("ready");
    expect(selectCurrentLevel(state)).toEqual(root);
  });

  it("clears the rebuilding flag once a rebuild succeeds or fails", () => {
    const key = start();
    useCodeGraphStore
      .getState()
      .setReady(key, handle(level(null, [node("a")])));
    useCodeGraphStore.getState().beginRebuild(key);

    useCodeGraphStore
      .getState()
      .setReady(key, handle(level(null, [node("b")])));
    expect(useCodeGraphStore.getState().byKey[key].rebuilding).toBe(false);

    useCodeGraphStore.getState().beginRebuild(key);
    useCodeGraphStore.getState().setError(key, "analysis: failed");
    expect(useCodeGraphStore.getState().byKey[key].rebuilding).toBe(false);
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
    expect(selectHiddenTypes(undefined)).toEqual([]);
    expect(selectCurrentLevel(undefined)).toBeUndefined();
  });
});
