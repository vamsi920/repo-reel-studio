import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { KnowledgeRepository } from "#/lib/knowledge/knowledge-engine";

const mockUseParams = vi.fn<() => Record<string, string | undefined>>();
const mockUseSearchParams = vi.fn(
  () => [new URLSearchParams(), vi.fn()] as const,
);

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useParams: () => mockUseParams(),
    useSearchParams: () => mockUseSearchParams(),
    useRevalidator: () => ({ revalidate: vi.fn() }),
  };
});

const ktBreadcrumbPropsSpy = vi.fn();
vi.mock("#/components/features/kt-video/kt-breadcrumb", () => ({
  KtBreadcrumb: (props: Record<string, unknown>) => {
    ktBreadcrumbPropsSpy(props);
    return <div data-testid="kt-breadcrumb" />;
  },
}));

vi.mock("#/components/features/markdown/markdown-renderer", () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="kt-page-markdown">{content}</div>
  ),
}));

vi.mock("#/components/features/markdown/mermaid-code-block", () => ({
  mermaidAwareCode: () => null,
}));

vi.mock("@remotion/player", () => ({
  Player: React.forwardRef(
    (
      props: { inputProps: { manifest: { repo_name: string } } },
      _ref: unknown,
    ) => (
      <div data-testid="kt-video-player">
        {props.inputProps.manifest.repo_name}
      </div>
    ),
  ),
}));

vi.mock("#/components/features/kt-video/kt-video-composition", () => ({
  KtVideoComposition: () => null,
}));

vi.mock("#/lib/kt-video/use-scene-narration", () => ({
  useSceneNarration: vi.fn(),
}));

const buildManifestMock = vi.fn();
vi.mock("#/lib/kt-video/build-manifest", () => ({
  buildKtManifestFromKnowledgePage: (
    ...args: Parameters<
      typeof import("#/lib/kt-video/build-manifest").buildKtManifestFromKnowledgePage
    >
  ) => buildManifestMock(...args),
}));

vi.mock("#/lib/kt-video/concept-flow", () => ({
  findConceptFlow: vi.fn(async () => []),
}));

vi.mock("#/lib/kt-video/narrate-manifest", () => ({
  narrateManifest: vi.fn(async (manifest: unknown) => manifest),
}));

vi.mock("#/lib/knowledge/workspace-file-reader", () => ({
  readSnapshotFiles: vi.fn(async () => ({ contents: {}, failedPaths: [] })),
}));

vi.mock("#/utils/custom-toast-handlers", () => ({
  displayErrorToast: vi.fn(),
}));

vi.mock("#/stores/codegraph-store", () => ({
  useCodeGraphStore: () => undefined,
}));

// The cold-load rehydration hook reads the conversation list through
// react-query; these tests seed the store directly and render without a
// QueryClient, so the live-match lookup is stubbed to "no conversations".
vi.mock("#/lib/knowledge/connected-repositories", () => ({
  useConnectedRepositories: () => ({ repositories: [], isLoading: false }),
  resolveCommitSha: vi.fn(),
}));

vi.mock("#/lib/data-platform/repositories/repository-identity", () => ({
  resolveOrgId: vi.fn().mockResolvedValue(null),
  findRepositoryUuid: vi.fn().mockResolvedValue(null),
}));

vi.mock("#/lib/data-platform/repositories/knowledge-repository", () => ({
  knowledgePersistenceRepository: {
    getLatestGenerationForRepository: vi.fn().mockResolvedValue(null),
  },
}));

import KtPage from "#/routes/kt-page";
import { I18nKey } from "#/i18n/declaration";
import { useKnowledgeStore } from "#/stores/knowledge-store";
import {
  findRepositoryUuid,
  resolveOrgId,
} from "#/lib/data-platform/repositories/repository-identity";
import { knowledgePersistenceRepository } from "#/lib/data-platform/repositories/knowledge-repository";
import { readSnapshotFiles } from "#/lib/knowledge/workspace-file-reader";

const REPOSITORY_ID = "acme/api@main";

const SNAPSHOT = {
  repositoryId: REPOSITORY_ID,
  owner: "acme",
  repo: "api",
  branch: "main",
  commitSha: "abcdef1234567890",
  localPath: "/workspace/api",
};

function page(id: string, title: string) {
  return {
    id,
    title,
    description: "",
    contentMarkdown: `# ${title}`,
    importance: "medium" as const,
    relevantFiles: [],
    diagrams: [],
    relatedPageIds: [],
  };
}

const KNOWLEDGE: KnowledgeRepository = {
  repositoryId: REPOSITORY_ID,
  commitSha: SNAPSHOT.commitSha,
  title: "API",
  summary: "",
  sections: [],
  pages: [page("page-a", "Page A"), page("page-b", "Page B")],
  generatedAt: new Date().toISOString(),
};

function paramsFor(pageId: string) {
  return {
    repositoryId: encodeURIComponent(REPOSITORY_ID),
    pageId: encodeURIComponent(pageId),
  };
}

describe("KtPage", () => {
  beforeEach(() => {
    // The narration toggle button is disabled without this -- the hook
    // itself is mocked above, but `speechSupported` is a plain
    // `"speechSynthesis" in window` check in the component.
    vi.stubGlobal("speechSynthesis", {});
    buildManifestMock.mockReset();
    buildManifestMock.mockImplementation((pg: { id: string }) => ({
      repo_name: `manifest-for-${pg.id}`,
      scenes: [{ id: `${pg.id}-scene` }],
      totalFrames: 30,
      fps: 30,
      repo_files: [],
    }));
    mockUseSearchParams.mockReturnValue([new URLSearchParams(), vi.fn()]);
    useKnowledgeStore.setState({
      byRepositoryId: {
        [REPOSITORY_ID]: {
          snapshot: SNAPSHOT,
          conversationUrl: "http://localhost:3000/conversations/c1",
          sessionApiKey: "key",
          status: "ready",
          progress: null,
          lastNonTerminalStatus: null,
          knowledge: KNOWLEDGE,
          error: null,
          qualityFlags: [],
          refreshCadence: "manual",
        },
      },
    });
  });

  afterEach(() => {
    useKnowledgeStore.setState({ byRepositoryId: {} });
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("rebuilds the video for the new page instead of keeping the previous page's stale video", async () => {
    const user = userEvent.setup();
    mockUseParams.mockReturnValue(paramsFor("page-a"));
    const { rerender } = render(<KtPage />);

    await user.click(screen.getByTestId("kt-page-watch-button"));
    await waitFor(() =>
      expect(screen.getByTestId("kt-video-player")).toHaveTextContent(
        "manifest-for-page-a",
      ),
    );
    expect(buildManifestMock).toHaveBeenCalledTimes(1);

    // Navigate to a different page under the same route -- this route
    // (`kt/:repositoryId/:pageId`) is reused across the param change, so the
    // component does not remount.
    mockUseParams.mockReturnValue(paramsFor("page-b"));
    rerender(<KtPage />);

    await waitFor(() =>
      expect(screen.getByTestId("kt-video-player")).toHaveTextContent(
        "manifest-for-page-b",
      ),
    );
    expect(buildManifestMock).toHaveBeenCalledTimes(2);
  });

  it("clears the stale manifest when navigating to a different repository whose page shares the same page id", async () => {
    const OTHER_REPOSITORY_ID = "acme/other@main";
    const OTHER_SNAPSHOT = {
      ...SNAPSHOT,
      repositoryId: OTHER_REPOSITORY_ID,
      repo: "other",
    };
    const OTHER_KNOWLEDGE: KnowledgeRepository = {
      repositoryId: OTHER_REPOSITORY_ID,
      commitSha: OTHER_SNAPSHOT.commitSha,
      title: "Other",
      summary: "",
      sections: [],
      pages: [page("page-a", "Other Page A")],
      generatedAt: new Date().toISOString(),
    };
    useKnowledgeStore.setState({
      byRepositoryId: {
        ...useKnowledgeStore.getState().byRepositoryId,
        [OTHER_REPOSITORY_ID]: {
          snapshot: OTHER_SNAPSHOT,
          conversationUrl: "http://localhost:3000/conversations/c2",
          sessionApiKey: "key2",
          status: "ready",
          progress: null,
          lastNonTerminalStatus: null,
          knowledge: OTHER_KNOWLEDGE,
          error: null,
          qualityFlags: [],
          refreshCadence: "manual",
        },
      },
    });
    // Both repos' "page-a" share a page id, so the manifest must be keyed by
    // something repo-distinguishing here to tell a stale manifest apart from
    // a freshly-rebuilt one.
    buildManifestMock.mockImplementation((pg: { id: string; title: string }) => ({
      repo_name: `manifest-for-${pg.title}`,
      scenes: [{ id: `${pg.id}-scene` }],
      totalFrames: 30,
      fps: 30,
      repo_files: [],
    }));

    const user = userEvent.setup();
    mockUseParams.mockReturnValue(paramsFor("page-a"));
    const { rerender } = render(<KtPage />);

    await user.click(screen.getByTestId("kt-page-watch-button"));
    await waitFor(() =>
      expect(screen.getByTestId("kt-video-player")).toHaveTextContent(
        "manifest-for-Page A",
      ),
    );

    // Navigate to a DIFFERENT repository whose page happens to share the
    // same "page-a" id -- only `repositoryId` changes, so this route is
    // reused rather than remounted.
    mockUseParams.mockReturnValue({
      repositoryId: encodeURIComponent(OTHER_REPOSITORY_ID),
      pageId: encodeURIComponent("page-a"),
    });
    rerender(<KtPage />);

    await waitFor(() =>
      expect(screen.getByTestId("kt-video-player")).toHaveTextContent(
        "manifest-for-Other Page A",
      ),
    );
    expect(buildManifestMock).toHaveBeenCalledTimes(2);
  });

  it("disables Watch KT while a video is already generating, preventing a duplicate concurrent generation", async () => {
    const user = userEvent.setup();
    mockUseParams.mockReturnValue(paramsFor("page-a"));
    let releaseRead: (() => void) | undefined;
    vi.mocked(readSnapshotFiles).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseRead = () => resolve({ contents: {}, failedPaths: [] });
        }),
    );
    render(<KtPage />);

    const watchButton = screen.getByTestId("kt-page-watch-button");
    await user.click(watchButton);
    await waitFor(() => expect(watchButton).toBeDisabled());

    // A second click while generation is in flight must not start a
    // duplicate, fully-concurrent generation.
    await user.click(watchButton);

    releaseRead?.();
    await waitFor(() =>
      expect(screen.getByTestId("kt-video-player")).toHaveTextContent(
        "manifest-for-page-a",
      ),
    );
    expect(buildManifestMock).toHaveBeenCalledTimes(1);
    expect(watchButton).not.toBeDisabled();
  });

  it("ignores a slow generation for the previous page once a newer page's generation has already finished", async () => {
    const user = userEvent.setup();
    mockUseParams.mockReturnValue(paramsFor("page-a"));
    let releaseFirstRead: (() => void) | undefined;
    vi.mocked(readSnapshotFiles)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirstRead = () => resolve({ contents: {}, failedPaths: [] });
          }),
      )
      .mockImplementationOnce(async () => ({ contents: {}, failedPaths: [] }));

    const { rerender } = render(<KtPage />);
    await user.click(screen.getByTestId("kt-page-watch-button"));
    await waitFor(() => expect(readSnapshotFiles).toHaveBeenCalledTimes(1));

    // Switch pages before the slow page-a generation resolves. The route
    // reuses this component across the param change, so the page-change
    // effect fires a fresh generation for page-b directly (mode is already
    // "watch").
    mockUseParams.mockReturnValue(paramsFor("page-b"));
    rerender(<KtPage />);

    await waitFor(() =>
      expect(screen.getByTestId("kt-video-player")).toHaveTextContent(
        "manifest-for-page-b",
      ),
    );

    // Now let the stale page-a generation resolve -- it must not clobber
    // page-b's already-loaded manifest. It bails out as soon as it notices
    // it's stale, so it never even reaches buildKtManifestFromKnowledgePage.
    releaseFirstRead?.();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(buildManifestMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("kt-video-player")).toHaveTextContent(
      "manifest-for-page-b",
    );
  });

  it("shows a heads-up banner for a page flagged with weak source grounding", async () => {
    useKnowledgeStore.setState({
      byRepositoryId: {
        [REPOSITORY_ID]: {
          snapshot: SNAPSHOT,
          conversationUrl: "http://localhost:3000/conversations/c1",
          sessionApiKey: "key",
          status: "ready",
          progress: null,
          lastNonTerminalStatus: null,
          knowledge: KNOWLEDGE,
          error: null,
          qualityFlags: [
            {
              pageId: "page-a",
              kind: "no-citations",
              detail: "Page A cites no source files.",
            },
          ],
          refreshCadence: "manual",
        },
      },
    });
    mockUseParams.mockReturnValue(paramsFor("page-a"));

    render(<KtPage />);

    expect(
      await screen.findByTestId("kt-page-quality-flags"),
    ).toHaveTextContent("Page A cites no source files.");
  });

  it("keeps showing the heads-up banner after switching to watch mode", async () => {
    useKnowledgeStore.setState({
      byRepositoryId: {
        [REPOSITORY_ID]: {
          snapshot: SNAPSHOT,
          conversationUrl: "http://localhost:3000/conversations/c1",
          sessionApiKey: "key",
          status: "ready",
          progress: null,
          lastNonTerminalStatus: null,
          knowledge: KNOWLEDGE,
          error: null,
          qualityFlags: [
            {
              pageId: "page-a",
              kind: "no-citations",
              detail: "Page A cites no source files.",
            },
          ],
          refreshCadence: "manual",
        },
      },
    });
    mockUseParams.mockReturnValue(paramsFor("page-a"));
    const user = userEvent.setup();

    render(<KtPage />);
    expect(await screen.findByTestId("kt-page-quality-flags")).toHaveTextContent(
      "Page A cites no source files.",
    );

    await user.click(screen.getByTestId("kt-page-watch-button"));
    await waitFor(() => expect(screen.getByTestId("kt-video-player")).toBeInTheDocument());

    expect(screen.getByTestId("kt-page-quality-flags")).toHaveTextContent(
      "Page A cites no source files.",
    );
  });

  it("does not show the banner for a page with no quality flags", async () => {
    mockUseParams.mockReturnValue(paramsFor("page-b"));

    render(<KtPage />);

    await screen.findByTestId("kt-page-markdown");
    expect(
      screen.queryByTestId("kt-page-quality-flags"),
    ).not.toBeInTheDocument();
  });

  it("passes the decoded repositoryId to KtBreadcrumb, not the raw URL-encoded route param", async () => {
    // The store key (and every other caller of KtBreadcrumb, e.g.
    // kt-repository.tsx) uses the real, decoded id -- KtBreadcrumb
    // encodeURIComponent()s it exactly once itself when navigating back. If
    // this component instead forwarded the raw route param (already
    // encodeURIComponent()'d by every navigation into this route), that
    // value would get encoded a second time, producing a broken "back to
    // repository" link for any id containing "/" or "@" -- which, per
    // connected-repositories.ts's `${owner}/${repo}@${branch}` shape, is
    // every real repositoryId.
    mockUseParams.mockReturnValue(paramsFor("page-a"));

    render(<KtPage />);

    await waitFor(() =>
      expect(ktBreadcrumbPropsSpy).toHaveBeenCalledWith(
        expect.objectContaining({ repositoryId: REPOSITORY_ID }),
      ),
    );
  });

  it("reflects the narration toggle's on/off state through aria-pressed", async () => {
    const user = userEvent.setup();
    mockUseParams.mockReturnValue(paramsFor("page-a"));
    render(<KtPage />);

    await user.click(screen.getByTestId("kt-page-watch-button"));
    const narrationToggle = await screen.findByTestId(
      "kt-page-narration-toggle",
    );
    expect(narrationToggle).toHaveAttribute("aria-pressed", "false");

    await user.click(narrationToggle);
    expect(narrationToggle).toHaveAttribute("aria-pressed", "true");

    await user.click(narrationToggle);
    expect(narrationToggle).toHaveAttribute("aria-pressed", "false");
  });
});

describe("KtPage deep link on a cold store", () => {
  beforeEach(() => {
    mockUseSearchParams.mockReturnValue([new URLSearchParams(), vi.fn()]);
    // A reload / bookmark of a doc page: nothing in memory yet, but the
    // repository has a completed generation persisted in Supabase.
    useKnowledgeStore.setState({ byRepositoryId: {} });
  });

  afterEach(() => {
    useKnowledgeStore.setState({ byRepositoryId: {} });
    vi.clearAllMocks();
  });

  it("rehydrates the persisted knowledge instead of rendering 'Page not found'", async () => {
    mockUseParams.mockReturnValue(paramsFor("page-b"));
    vi.mocked(resolveOrgId).mockResolvedValue("org-1");
    vi.mocked(findRepositoryUuid).mockResolvedValue("repo-uuid-1");
    vi.mocked(
      knowledgePersistenceRepository.getLatestGenerationForRepository,
    ).mockResolvedValue(KNOWLEDGE);

    render(<KtPage />);

    expect(screen.getByText(I18nKey.KT$STARTING)).toBeInTheDocument();
    expect(screen.queryByText(I18nKey.KT$PAGE_NOT_FOUND)).not.toBeInTheDocument();

    expect(await screen.findByTestId("kt-page-markdown")).toHaveTextContent(
      "# Page B",
    );
    expect(screen.queryByText(I18nKey.KT$PAGE_NOT_FOUND)).not.toBeInTheDocument();
  });

  it("says 'Page not found' only after the lookup found nothing", async () => {
    mockUseParams.mockReturnValue(paramsFor("page-b"));
    vi.mocked(resolveOrgId).mockResolvedValue("org-1");
    vi.mocked(findRepositoryUuid).mockResolvedValue(null);

    render(<KtPage />);

    expect(await screen.findByText(I18nKey.KT$PAGE_NOT_FOUND)).toBeInTheDocument();
  });

  it("shows why generation failed instead of the generic 'Page not found' message", () => {
    mockUseParams.mockReturnValue(paramsFor("page-a"));
    useKnowledgeStore.setState({
      byRepositoryId: {
        [REPOSITORY_ID]: {
          snapshot: SNAPSHOT,
          conversationUrl: null,
          sessionApiKey: null,
          status: "error",
          progress: null,
          lastNonTerminalStatus: null,
          knowledge: null,
          error: "DeepWiki refused the request: rate limited.",
          qualityFlags: [],
          refreshCadence: "manual",
        },
      },
    });

    render(<KtPage />);

    expect(screen.getByTestId("kt-page-error")).toHaveTextContent(
      "DeepWiki refused the request: rate limited.",
    );
    expect(
      screen.queryByText(I18nKey.KT$PAGE_NOT_FOUND),
    ).not.toBeInTheDocument();
  });
});
