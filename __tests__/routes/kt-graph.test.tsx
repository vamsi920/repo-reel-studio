import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, useParamsMock } from "test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KtGraph from "#/routes/kt-graph";
import { I18nKey } from "#/i18n/declaration";
import { useKnowledgeStore } from "#/stores/knowledge-store";
import { useCodeGraphStore } from "#/stores/codegraph-store";
import {
  resolveOrgId,
  findRepositoryUuid,
} from "#/lib/data-platform/repositories/repository-identity";
import { codegraphPersistenceRepository } from "#/lib/data-platform/repositories/codegraph-repository";
import { knowledgePersistenceRepository } from "#/lib/data-platform/repositories/knowledge-repository";
import { resolveHeadCommitSha } from "#/lib/codegraph/workspace-identity";
import { codeGraphKey } from "#/lib/codegraph/codegraph-types";
import {
  openExistingAnalysis,
  runAnalysis,
  type AnalysisHandle,
  type CodeGraphLevelPayload,
  type SearchEntry,
} from "#/lib/codegraph/analyzer-runner";
import type {
  CodeGraphMeta,
  CodeGraphNode,
} from "#/lib/codegraph/codegraph-types";

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => ({ backend: { id: "local" }, orgId: null }),
}));

vi.mock("#/lib/data-platform/repositories/repository-identity", () => ({
  resolvePersistenceIds: vi.fn().mockResolvedValue(null),
  resolveOrgId: vi.fn().mockResolvedValue(null),
  findRepositoryUuid: vi.fn().mockResolvedValue(null),
}));

vi.mock("#/lib/data-platform/repositories/codegraph-repository", () => ({
  codegraphPersistenceRepository: {
    hasSnapshot: vi.fn().mockResolvedValue(false),
    saveSnapshot: vi.fn(),
    findSnapshotWorkspaceId: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("#/lib/codegraph/analyzer-runner", async () => {
  const actual = await vi.importActual<
    typeof import("#/lib/codegraph/analyzer-runner")
  >("#/lib/codegraph/analyzer-runner");
  return {
    ...actual,
    openExistingAnalysis: vi.fn().mockResolvedValue(null),
    runAnalysis: vi.fn(),
  };
});

vi.mock("#/lib/knowledge/connected-repositories", () => ({
  useConnectedRepositories: () => ({ repositories: [], isLoading: false }),
  resolveCommitSha: vi.fn(),
}));

vi.mock("#/lib/data-platform/repositories/knowledge-repository", () => ({
  knowledgePersistenceRepository: {
    getLatestGenerationForRepository: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("#/lib/codegraph/workspace-identity", () => ({
  workspaceIdForSnapshot: (snapshot: { localPath: string }) =>
    snapshot.localPath,
  resolveHeadCommitSha: vi.fn().mockResolvedValue(null),
}));

const REPOSITORY_ID = "acme/api@main";
const WORKSPACE_ID = "/workspace/api";
const COMMIT = "abcdef1234567890";

function node(
  id: string,
  overrides: Partial<CodeGraphNode> = {},
): CodeGraphNode {
  return {
    id,
    level: "subsystem",
    type: "service",
    name: id,
    summary: "",
    complexity: "simple",
    tags: [],
    childCount: 0,
    filePaths: [],
    ...overrides,
  };
}

const knowledge = {
  repositoryId: REPOSITORY_ID,
  commitSha: COMMIT,
  title: "acme/api",
  summary: "",
  sections: [],
  pages: [],
  generatedAt: "2026-01-01T00:00:00.000Z",
};

describe("KtGraph search", () => {
  beforeEach(() => {
    useParamsMock.mockReturnValue({
      repositoryId: encodeURIComponent(REPOSITORY_ID),
    } as never);
    useKnowledgeStore.setState({
      byRepositoryId: {
        [REPOSITORY_ID]: {
          snapshot: {
            repositoryId: REPOSITORY_ID,
            owner: "acme",
            repo: "api",
            branch: "main",
            commitSha: COMMIT,
            localPath: WORKSPACE_ID,
          },
          conversationUrl: null,
          sessionApiKey: null,
          status: "ready",
          progress: null,
          lastNonTerminalStatus: null,
          knowledge,
          error: null,
          qualityFlags: [],
          refreshCadence: "manual",
        },
      },
    });
    useCodeGraphStore.setState({
      byKey: {},
      handles: {},
      pinnedCommitByRepositoryId: {},
    });
  });

  afterEach(() => {
    useKnowledgeStore.setState({ byRepositoryId: {} });
    useCodeGraphStore.setState({
      byKey: {},
      handles: {},
      pinnedCommitByRepositoryId: {},
    });
    vi.clearAllMocks();
  });

  it("returns to the system view when a root-level result is picked from a deeper level", async () => {
    const rootLevel: CodeGraphLevelPayload = {
      parentId: null,
      nodes: [node("sub1", { childCount: 1 })],
      edges: [],
      crumbs: [{ id: null, name: "System" }],
    };
    const childLevel: CodeGraphLevelPayload = {
      parentId: "sub1",
      nodes: [node("leaf1", { level: "unit", type: "function" })],
      edges: [],
      crumbs: [
        { id: null, name: "System" },
        { id: "sub1", name: "sub1" },
      ],
    };
    const meta: CodeGraphMeta = {
      workspaceId: WORKSPACE_ID,
      repositoryId: REPOSITORY_ID,
      commitSha: COMMIT,
      generatedAt: "2026-01-01T00:00:00.000Z",
      fileCount: 1,
      symbolCount: 1,
      languages: [],
      frameworks: [],
    };
    // A subsystem's search entry carries `parentId: ""` — it lives at the
    // system root, not under another node.
    const searchIndex: SearchEntry[] = [
      {
        id: "sub1",
        name: "sub1",
        type: "service",
        filePath: "",
        parentId: "",
        level: "subsystem",
      },
      {
        id: "leaf1",
        name: "leaf1",
        type: "function",
        filePath: "",
        parentId: "sub1",
        level: "unit",
      },
    ];
    const handle: AnalysisHandle = {
      meta,
      root: rootLevel,
      loadLevel: async (parentId) => (parentId === "sub1" ? childLevel : null),
      loadSearchIndex: async () => searchIndex,
      readSource: async () => null,
    };

    const key = useCodeGraphStore.getState().start({
      workspaceId: WORKSPACE_ID,
      repositoryId: REPOSITORY_ID,
      commitSha: COMMIT,
    });
    useCodeGraphStore.getState().setReady(key, handle);
    // Drill into "sub1" before the user searches, so the open level's nodes
    // no longer include the subsystem itself.
    useCodeGraphStore.getState().beginLoadLevel(key, "sub1");
    useCodeGraphStore.getState().setLevel(key, "sub1", childLevel);
    useCodeGraphStore.getState().navigateTo(key, "sub1");

    renderWithProviders(<KtGraph />);

    const user = userEvent.setup();
    const search = await screen.findByTestId("codegraph-search");
    await user.type(search, "sub1");

    const results = await screen.findByTestId("codegraph-search-results");
    await user.click(within(results).getByText("sub1"));

    await waitFor(() => {
      expect(screen.getByTestId("codegraph-breadcrumbs")).toHaveTextContent(
        "System",
      );
      expect(screen.getByTestId("codegraph-breadcrumbs")).not.toHaveTextContent(
        "sub1",
      );
    });
    expect(screen.getByTestId("codegraph-node-details")).toHaveTextContent(
      "sub1",
    );
  });

  it("keeps the graph on screen while a forced rebuild is running instead of blanking to a spinner", async () => {
    const meta: CodeGraphMeta = {
      workspaceId: WORKSPACE_ID,
      repositoryId: REPOSITORY_ID,
      commitSha: COMMIT,
      generatedAt: "2026-01-01T00:00:00.000Z",
      fileCount: 1,
      symbolCount: 1,
      languages: [],
      frameworks: [],
    };
    const rootLevel: CodeGraphLevelPayload = {
      parentId: null,
      nodes: [node("sub1")],
      edges: [],
      crumbs: [{ id: null, name: "System" }],
    };
    const handle: AnalysisHandle = {
      meta,
      root: rootLevel,
      loadLevel: async () => null,
      loadSearchIndex: async () => [],
      readSource: async () => null,
    };

    const key = useCodeGraphStore.getState().start({
      workspaceId: WORKSPACE_ID,
      repositoryId: REPOSITORY_ID,
      commitSha: COMMIT,
    });
    useCodeGraphStore.getState().setReady(key, handle);
    useCodeGraphStore.getState().beginRebuild(key);

    renderWithProviders(<KtGraph />);

    // The already-open graph (breadcrumbs, node) stays mounted...
    expect(
      await screen.findByTestId("codegraph-breadcrumbs"),
    ).toHaveTextContent("System");
    expect(screen.getByTestId("codegraph-node-count")).toBeInTheDocument();
    // ...and the rebuild control reflects the in-progress rebuild rather than
    // the whole view disappearing behind a blank "analyzing" spinner.
    expect(screen.getByTestId("codegraph-rebuild")).toBeDisabled();
  });

  it("rebuilds from the stale banner under HEAD and clears the banner", async () => {
    const HEAD = "fedcba0987654321";
    // The rebuild needs a live session; the freshness check and the rebuild
    // both resolve the same HEAD, which is not the commit the graph is on.
    useKnowledgeStore.setState((current) => ({
      byRepositoryId: {
        [REPOSITORY_ID]: {
          ...current.byRepositoryId[REPOSITORY_ID],
          conversationUrl: "http://agent.test/conversations/1",
          sessionApiKey: "key",
        },
      },
    }));
    vi.mocked(resolveHeadCommitSha).mockResolvedValue(HEAD);

    const rootLevel: CodeGraphLevelPayload = {
      parentId: null,
      nodes: [node("sub1")],
      edges: [],
      crumbs: [{ id: null, name: "System" }],
    };
    const makeHandle = (commitSha: string): AnalysisHandle => ({
      meta: {
        workspaceId: WORKSPACE_ID,
        repositoryId: REPOSITORY_ID,
        commitSha,
        generatedAt: "2026-01-01T00:00:00.000Z",
        fileCount: 1,
        symbolCount: 1,
        languages: [],
        frameworks: [],
      },
      root: rootLevel,
      loadLevel: async () => null,
      loadSearchIndex: async () => [],
      readSource: async () => null,
    });
    vi.mocked(runAnalysis).mockImplementation(async (options) =>
      makeHandle(options.snapshot.commitSha),
    );

    const oldKey = useCodeGraphStore.getState().start({
      workspaceId: WORKSPACE_ID,
      repositoryId: REPOSITORY_ID,
      commitSha: COMMIT,
    });
    useCodeGraphStore.getState().setReady(oldKey, makeHandle(COMMIT));

    renderWithProviders(<KtGraph />);

    expect(
      await screen.findByTestId("codegraph-stale-banner"),
    ).toHaveTextContent(`${COMMIT.slice(0, 7)} → ${HEAD.slice(0, 7)}`);

    await userEvent.click(screen.getByTestId("codegraph-reanalyze"));

    // The analyzer scans the HEAD checkout, so the run is labelled — and its
    // output dir, Storage mirror and snapshot row keyed — under HEAD, not
    // under the commit the Docs snapshot was generated at.
    await waitFor(() => expect(runAnalysis).toHaveBeenCalledTimes(1));
    expect(vi.mocked(runAnalysis).mock.calls[0][0].snapshot.commitSha).toBe(
      HEAD,
    );

    // The route follows the rebuilt graph: header on HEAD, no stale banner,
    // and the old commit's in-memory graph is gone rather than overwritten.
    const newKey = codeGraphKey(WORKSPACE_ID, REPOSITORY_ID, HEAD);
    await waitFor(() =>
      expect(useCodeGraphStore.getState().byKey[newKey]?.status).toBe("ready"),
    );
    expect(
      await screen.findByText(`acme/api@${HEAD.slice(0, 7)}`, { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("codegraph-stale-banner"),
    ).not.toBeInTheDocument();
    expect(useCodeGraphStore.getState().byKey[oldKey]).toBeUndefined();
    expect(
      useCodeGraphStore.getState().byKey[newKey]?.freshness?.freshness,
    ).toBe("fresh");
    // The Docs snapshot itself keeps the commit the docs were generated at.
    expect(
      useKnowledgeStore.getState().byRepositoryId[REPOSITORY_ID].snapshot
        .commitSha,
    ).toBe(COMMIT);
  });

  it("keeps the existing graph on screen when a forced rebuild to a new HEAD commit fails", async () => {
    const HEAD = "fedcba0987654321";
    useKnowledgeStore.setState((current) => ({
      byRepositoryId: {
        [REPOSITORY_ID]: {
          ...current.byRepositoryId[REPOSITORY_ID],
          conversationUrl: "http://agent.test/conversations/1",
          sessionApiKey: "key",
        },
      },
    }));
    vi.mocked(resolveHeadCommitSha).mockResolvedValue(HEAD);
    vi.mocked(runAnalysis).mockRejectedValue(new Error("sandbox timed out"));

    const rootLevel: CodeGraphLevelPayload = {
      parentId: null,
      nodes: [node("sub1")],
      edges: [],
      crumbs: [{ id: null, name: "System" }],
    };
    const handle: AnalysisHandle = {
      meta: {
        workspaceId: WORKSPACE_ID,
        repositoryId: REPOSITORY_ID,
        commitSha: COMMIT,
        generatedAt: "2026-01-01T00:00:00.000Z",
        fileCount: 1,
        symbolCount: 1,
        languages: [],
        frameworks: [],
      },
      root: rootLevel,
      loadLevel: async () => null,
      loadSearchIndex: async () => [],
      readSource: async () => null,
    };

    const oldKey = useCodeGraphStore.getState().start({
      workspaceId: WORKSPACE_ID,
      repositoryId: REPOSITORY_ID,
      commitSha: COMMIT,
    });
    useCodeGraphStore.getState().setReady(oldKey, handle);

    renderWithProviders(<KtGraph />);

    expect(
      await screen.findByTestId("codegraph-stale-banner"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("codegraph-reanalyze"));

    await waitFor(() => expect(runAnalysis).toHaveBeenCalledTimes(1));

    // The rebuild targeted the new HEAD and failed -- the graph that was
    // already valid and on screen must survive that, not be replaced by a
    // full error screen.
    await waitFor(() => {
      expect(useCodeGraphStore.getState().byKey[oldKey]?.status).toBe(
        "ready",
      );
      expect(useCodeGraphStore.getState().byKey[oldKey]?.rebuilding).toBe(
        false,
      );
    });
    expect(screen.getByTestId("codegraph-breadcrumbs")).toHaveTextContent(
      "System",
    );
    expect(screen.queryByText("sandbox timed out")).not.toBeInTheDocument();
    // The failed, retargeted attempt leaves no orphaned store entry and no
    // premature pin to a commit that was never actually analyzed.
    const newKey = codeGraphKey(WORKSPACE_ID, REPOSITORY_ID, HEAD);
    expect(useCodeGraphStore.getState().byKey[newKey]).toBeUndefined();
    expect(
      useCodeGraphStore.getState().pinnedCommitByRepositoryId[REPOSITORY_ID],
    ).toBeUndefined();
  });

  it("fetches the search index once even when the user types before the first fetch resolves", async () => {
    const meta: CodeGraphMeta = {
      workspaceId: WORKSPACE_ID,
      repositoryId: REPOSITORY_ID,
      commitSha: COMMIT,
      generatedAt: "2026-01-01T00:00:00.000Z",
      fileCount: 1,
      symbolCount: 1,
      languages: [],
      frameworks: [],
    };
    const rootLevel: CodeGraphLevelPayload = {
      parentId: null,
      nodes: [node("sub1")],
      edges: [],
      crumbs: [{ id: null, name: "System" }],
    };
    let resolveLoad: ((entries: SearchEntry[]) => void) | undefined;
    const loadSearchIndex = vi.fn(
      () =>
        new Promise<SearchEntry[]>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const handle: AnalysisHandle = {
      meta,
      root: rootLevel,
      loadLevel: async () => null,
      loadSearchIndex,
      readSource: async () => null,
    };

    const key = useCodeGraphStore.getState().start({
      workspaceId: WORKSPACE_ID,
      repositoryId: REPOSITORY_ID,
      commitSha: COMMIT,
    });
    useCodeGraphStore.getState().setReady(key, handle);

    renderWithProviders(<KtGraph />);

    const user = userEvent.setup();
    const search = await screen.findByTestId("codegraph-search");
    await user.type(search, "sub");

    expect(loadSearchIndex).toHaveBeenCalledTimes(1);
    resolveLoad?.([]);
  });

  it("fetches a level shard once, shows progress meanwhile, and says so with a retry when it cannot be read", async () => {
    const meta: CodeGraphMeta = {
      workspaceId: WORKSPACE_ID,
      repositoryId: REPOSITORY_ID,
      commitSha: COMMIT,
      generatedAt: "2026-01-01T00:00:00.000Z",
      fileCount: 1,
      symbolCount: 1,
      languages: [],
      frameworks: [],
    };
    const rootLevel: CodeGraphLevelPayload = {
      parentId: null,
      nodes: [node("sub1", { name: "Payments", childCount: 3 })],
      edges: [],
      crumbs: [{ id: null, name: "System" }],
    };
    // The first fetch stays pending until the test releases it, so every
    // extra click lands while it is still in flight — exactly what a real
    // double click on the canvas produces (single + double click handlers).
    let release: (level: CodeGraphLevelPayload | null) => void = () => {};
    const loadLevel = vi.fn(
      () =>
        new Promise<CodeGraphLevelPayload | null>((resolve) => {
          release = resolve;
        }),
    );
    const handle: AnalysisHandle = {
      meta,
      root: rootLevel,
      loadLevel,
      loadSearchIndex: async () => [],
      readSource: async () => null,
    };

    const key = useCodeGraphStore.getState().start({
      workspaceId: WORKSPACE_ID,
      repositoryId: REPOSITORY_ID,
      commitSha: COMMIT,
    });
    useCodeGraphStore.getState().setReady(key, handle);
    useCodeGraphStore.getState().selectNode(key, "sub1");

    renderWithProviders(<KtGraph />);

    const user = userEvent.setup();
    const drill = await screen.findByTestId("codegraph-drill-down");
    await user.click(drill);
    await user.click(drill);
    await user.click(drill);

    expect(loadLevel).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("codegraph-level-loading")).toBeInTheDocument();
    expect(
      screen.queryByTestId("codegraph-level-error"),
    ).not.toBeInTheDocument();

    release(null);

    // Route tests render bare i18n keys; the interpolated node name is
    // covered by the toolbar's own test.
    expect(
      await screen.findByTestId("codegraph-level-error"),
    ).toHaveTextContent("CODEGRAPH$LEVEL_LOAD_FAILED");
    expect(
      screen.queryByTestId("codegraph-level-loading"),
    ).not.toBeInTheDocument();
    // Still on the system view — a failed drill must not navigate.
    expect(screen.getByTestId("codegraph-breadcrumbs")).not.toHaveTextContent(
      "Payments",
    );

    await user.click(screen.getByTestId("codegraph-level-retry"));
    expect(loadLevel).toHaveBeenCalledTimes(2);
    expect(loadLevel).toHaveBeenLastCalledWith("sub1");
    expect(
      screen.queryByTestId("codegraph-level-error"),
    ).not.toBeInTheDocument();

    release({
      parentId: "sub1",
      nodes: [node("leaf1", { level: "unit", type: "function" })],
      edges: [],
      crumbs: [
        { id: null, name: "System" },
        { id: "sub1", name: "Payments" },
      ],
    });
    await waitFor(() => {
      expect(screen.getByTestId("codegraph-breadcrumbs")).toHaveTextContent(
        "Payments",
      );
    });
  });

  it("does not carry a type filter from one level onto another", async () => {
    const meta: CodeGraphMeta = {
      workspaceId: WORKSPACE_ID,
      repositoryId: REPOSITORY_ID,
      commitSha: COMMIT,
      generatedAt: "2026-01-01T00:00:00.000Z",
      fileCount: 1,
      symbolCount: 1,
      languages: [],
      frameworks: [],
    };
    const rootLevel: CodeGraphLevelPayload = {
      parentId: null,
      nodes: [node("sub1", { name: "Payments", childCount: 2 })],
      edges: [],
      crumbs: [{ id: null, name: "System" }],
    };
    const childLevel: CodeGraphLevelPayload = {
      parentId: "sub1",
      nodes: [
        node("file1", { level: "unit", type: "file", name: "charge.ts" }),
        node("dir1", { level: "unit", type: "folder", name: "helpers" }),
      ],
      edges: [],
      crumbs: [
        { id: null, name: "System" },
        { id: "sub1", name: "Payments" },
      ],
    };
    const handle: AnalysisHandle = {
      meta,
      root: rootLevel,
      loadLevel: async (parentId) => (parentId === "sub1" ? childLevel : null),
      loadSearchIndex: async () => [],
      readSource: async () => null,
    };

    const key = useCodeGraphStore.getState().start({
      workspaceId: WORKSPACE_ID,
      repositoryId: REPOSITORY_ID,
      commitSha: COMMIT,
    });
    useCodeGraphStore.getState().setReady(key, handle);
    useCodeGraphStore.getState().selectNode(key, "sub1");

    renderWithProviders(<KtGraph />);

    const user = userEvent.setup();
    await user.click(await screen.findByTestId("codegraph-drill-down"));
    await waitFor(() => {
      expect(screen.getByTestId("codegraph-breadcrumbs")).toHaveTextContent(
        "Payments",
      );
    });

    // Hide "file" inside the folder level.
    const filtersToggle = screen.getByTestId("codegraph-filters-toggle");
    await user.click(filtersToggle);
    await user.click(
      within(screen.getByTestId("codegraph-filters")).getByRole("button", {
        name: "file",
      }),
    );
    expect(filtersToggle).toHaveTextContent("1");
    expect(screen.getByTestId("codegraph-node-count")).toHaveTextContent(
      "CODEGRAPH$NODES_FILTERED",
    );

    // Back on the system level there is nothing hidden: no badge, a plain
    // count, and only this level's own type in the panel.
    await user.click(screen.getByTestId("codegraph-back"));
    await waitFor(() => {
      expect(screen.getByTestId("codegraph-breadcrumbs")).not.toHaveTextContent(
        "Payments",
      );
    });
    expect(
      screen.getByTestId("codegraph-filters-toggle"),
    ).not.toHaveTextContent("1");
    expect(screen.getByTestId("codegraph-node-count")).toHaveTextContent(
      "CODEGRAPH$NODES",
    );
    expect(screen.getByTestId("codegraph-node-count")).not.toHaveTextContent(
      "CODEGRAPH$NODES_FILTERED",
    );
    const panel = screen.getByTestId("codegraph-filters");
    expect(
      within(panel).getByRole("button", { name: "service" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(panel).queryByRole("button", { name: "file" }),
    ).not.toBeInTheDocument();
  });

  it("colors the analysis-failed icon with a real design-system token", async () => {
    const key = useCodeGraphStore.getState().start({
      workspaceId: WORKSPACE_ID,
      repositoryId: REPOSITORY_ID,
      commitSha: COMMIT,
    });
    useCodeGraphStore.getState().setError(key, "analysis: boom");

    const { container } = renderWithProviders(<KtGraph />);

    await screen.findByText("analysis: boom");
    // `--danger-500` is not a token this app defines (the real one is
    // `--error-500`, used everywhere else on this page); referencing it left
    // the icon uncolored.
    expect(container.querySelector('[class*="--error-500"]')).not.toBeNull();
    expect(container.querySelector('[class*="--danger-500"]')).toBeNull();
  });
});

describe("KtGraph cold rehydration", () => {
  const COLD_REPOSITORY_ID = "acme/docs@main";
  const COLD_COMMIT = "1122334455667788";

  beforeEach(() => {
    useParamsMock.mockReturnValue({
      repositoryId: encodeURIComponent(COLD_REPOSITORY_ID),
    } as never);
    // A cold-rehydrated (Supabase) Docs entry has real content but no
    // `localPath` and no live session -- see kt-repository.tsx's
    // `tryColdRehydration`.
    useKnowledgeStore.setState({
      byRepositoryId: {
        [COLD_REPOSITORY_ID]: {
          snapshot: {
            repositoryId: COLD_REPOSITORY_ID,
            owner: "acme",
            repo: "docs",
            branch: "main",
            commitSha: COLD_COMMIT,
            localPath: "",
          },
          conversationUrl: null,
          sessionApiKey: null,
          status: "ready",
          progress: null,
          lastNonTerminalStatus: null,
          knowledge,
          error: null,
          qualityFlags: [],
          refreshCadence: "manual",
        },
      },
    });
    useCodeGraphStore.setState({
      byKey: {},
      handles: {},
      pinnedCommitByRepositoryId: {},
    });
  });

  afterEach(() => {
    useKnowledgeStore.setState({ byRepositoryId: {} });
    useCodeGraphStore.setState({
      byKey: {},
      handles: {},
      pinnedCommitByRepositoryId: {},
    });
    vi.clearAllMocks();
  });

  it("renders a graph that was already generated elsewhere instead of showing the empty state", async () => {
    vi.mocked(resolveOrgId).mockResolvedValue("org-1");
    vi.mocked(findRepositoryUuid).mockResolvedValue("repo-uuid-1");
    vi.mocked(
      codegraphPersistenceRepository.findSnapshotWorkspaceId,
    ).mockResolvedValue("real-workspace-1");

    const meta: CodeGraphMeta = {
      workspaceId: "real-workspace-1",
      repositoryId: COLD_REPOSITORY_ID,
      commitSha: COLD_COMMIT,
      generatedAt: "2026-01-01T00:00:00.000Z",
      fileCount: 4,
      symbolCount: 2,
      languages: [],
      frameworks: [],
    };
    const rootLevel: CodeGraphLevelPayload = {
      parentId: null,
      nodes: [node("sub1")],
      edges: [],
      crumbs: [{ id: null, name: "System" }],
    };
    const handle: AnalysisHandle = {
      meta,
      root: rootLevel,
      loadLevel: async () => null,
      loadSearchIndex: async () => [],
      readSource: async () => null,
    };
    vi.mocked(openExistingAnalysis).mockResolvedValue(handle);

    renderWithProviders(<KtGraph />);

    expect(
      await screen.findByTestId("codegraph-breadcrumbs"),
    ).toHaveTextContent("System");

    expect(findRepositoryUuid).toHaveBeenCalledWith(
      "org-1",
      "acme",
      "docs",
      undefined,
    );
    expect(
      codegraphPersistenceRepository.findSnapshotWorkspaceId,
    ).toHaveBeenCalledWith("repo-uuid-1", COLD_COMMIT);
    expect(openExistingAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        storageIds: {
          workspaceId: "real-workspace-1",
          repositoryUuid: "repo-uuid-1",
        },
      }),
    );
  });

  it("shows the clear no-session error instead of getting stuck on \"analyzing\" when openExistingAnalysis throws", async () => {
    // `openExistingAnalysis` can throw synchronously (no live backend/session
    // and the Storage fast path missed) instead of resolving null. Before
    // this was guarded, the auto-check effect's unhandled rejection left the
    // store on "analyzing" forever instead of falling through to the
    // existing "open a live session" guard below it.
    vi.mocked(resolveOrgId).mockResolvedValue("org-1");
    vi.mocked(findRepositoryUuid).mockResolvedValue("repo-uuid-1");
    vi.mocked(
      codegraphPersistenceRepository.findSnapshotWorkspaceId,
    ).mockResolvedValue("real-workspace-1");
    vi.mocked(openExistingAnalysis).mockRejectedValue(
      new Error("No backend is configured."),
    );

    renderWithProviders(<KtGraph />);

    expect(
      await screen.findByText(/open this repository's conversation/i),
    ).toBeInTheDocument();
  });

  it("keeps showing the empty state, not an error, when no prior snapshot exists for this commit", async () => {
    vi.mocked(resolveOrgId).mockResolvedValue("org-1");
    vi.mocked(findRepositoryUuid).mockResolvedValue("repo-uuid-1");
    vi.mocked(
      codegraphPersistenceRepository.findSnapshotWorkspaceId,
    ).mockResolvedValue(null);

    renderWithProviders(<KtGraph />);

    expect(await screen.findByTestId("codegraph-generate")).toBeInTheDocument();
    expect(openExistingAnalysis).not.toHaveBeenCalled();
  });
});

describe("KtGraph deep link on a cold store", () => {
  const COLD_REPOSITORY_ID = "acme/docs@main";
  const COLD_COMMIT = "1122334455667788";

  beforeEach(() => {
    useParamsMock.mockReturnValue({
      repositoryId: encodeURIComponent(COLD_REPOSITORY_ID),
    } as never);
    // A reload / bookmark of the CodeGraph tab: nothing in memory yet, but
    // the repository has a completed generation persisted in Supabase.
    useKnowledgeStore.setState({ byRepositoryId: {} });
    useCodeGraphStore.setState({
      byKey: {},
      handles: {},
      pinnedCommitByRepositoryId: {},
    });
  });

  afterEach(() => {
    useKnowledgeStore.setState({ byRepositoryId: {} });
    useCodeGraphStore.setState({
      byKey: {},
      handles: {},
      pinnedCommitByRepositoryId: {},
    });
    vi.clearAllMocks();
  });

  it("rehydrates the persisted knowledge instead of asking to generate docs first", async () => {
    vi.mocked(resolveOrgId).mockResolvedValue("org-1");
    vi.mocked(findRepositoryUuid).mockResolvedValue("repo-uuid-1");
    vi.mocked(
      knowledgePersistenceRepository.getLatestGenerationForRepository,
    ).mockResolvedValue({
      ...knowledge,
      repositoryId: COLD_REPOSITORY_ID,
      commitSha: COLD_COMMIT,
    });
    vi.mocked(
      codegraphPersistenceRepository.findSnapshotWorkspaceId,
    ).mockResolvedValue(null);

    renderWithProviders(<KtGraph />);

    // Loading, not the "generate docs first" empty state, while the lookup
    // is in flight — that state used to be committed on the first render.
    expect(screen.getByText(I18nKey.KT$STARTING)).toBeInTheDocument();
    expect(
      screen.queryByText(I18nKey.CODEGRAPH$NO_KNOWLEDGE),
    ).not.toBeInTheDocument();

    // Once hydrated the graph page itself renders (here: its own "no graph
    // for this commit yet" state, since no snapshot is stored).
    expect(await screen.findByTestId("codegraph-generate")).toBeInTheDocument();
    expect(
      screen.queryByText(I18nKey.CODEGRAPH$NO_KNOWLEDGE),
    ).not.toBeInTheDocument();
    expect(
      useKnowledgeStore.getState().byRepositoryId[COLD_REPOSITORY_ID]?.knowledge
        ?.commitSha,
    ).toBe(COLD_COMMIT);
  });

  it("falls back to the empty state only after the lookup found nothing", async () => {
    vi.mocked(resolveOrgId).mockResolvedValue("org-1");
    vi.mocked(findRepositoryUuid).mockResolvedValue(null);

    renderWithProviders(<KtGraph />);

    expect(
      await screen.findByText(I18nKey.CODEGRAPH$NO_KNOWLEDGE),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("codegraph-generate")).not.toBeInTheDocument();
  });
});
