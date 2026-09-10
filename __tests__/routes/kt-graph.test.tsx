import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, useParamsMock } from "test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KtGraph from "#/routes/kt-graph";
import { useKnowledgeStore } from "#/stores/knowledge-store";
import { useCodeGraphStore } from "#/stores/codegraph-store";
import type {
  AnalysisHandle,
  CodeGraphLevelPayload,
  SearchEntry,
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
}));

vi.mock("#/lib/data-platform/repositories/codegraph-repository", () => ({
  codegraphPersistenceRepository: {
    hasSnapshot: vi.fn().mockResolvedValue(false),
    saveSnapshot: vi.fn(),
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
    useCodeGraphStore.setState({ byKey: {}, handles: {} });
  });

  afterEach(() => {
    useKnowledgeStore.setState({ byRepositoryId: {} });
    useCodeGraphStore.setState({ byKey: {}, handles: {} });
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
      loadLevel: async (parentId) =>
        parentId === "sub1" ? childLevel : null,
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
      expect(
        screen.getByTestId("codegraph-breadcrumbs"),
      ).not.toHaveTextContent("sub1");
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
    expect(await screen.findByTestId("codegraph-breadcrumbs")).toHaveTextContent(
      "System",
    );
    expect(screen.getByTestId("codegraph-node-count")).toBeInTheDocument();
    // ...and the rebuild control reflects the in-progress rebuild rather than
    // the whole view disappearing behind a blank "analyzing" spinner.
    expect(screen.getByTestId("codegraph-rebuild")).toBeDisabled();
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
