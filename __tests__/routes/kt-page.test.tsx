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

vi.mock("#/components/features/kt-video/kt-breadcrumb", () => ({
  KtBreadcrumb: () => <div data-testid="kt-breadcrumb" />,
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

import KtPage from "#/routes/kt-page";
import { useKnowledgeStore } from "#/stores/knowledge-store";

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
});
