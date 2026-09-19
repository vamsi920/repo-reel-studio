import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders, useParamsMock } from "test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KtRepository from "#/routes/kt-repository";
import { I18nKey } from "#/i18n/declaration";
import { useKnowledgeStore } from "#/stores/knowledge-store";
import type { RepoCandidate } from "#/lib/knowledge/connected-repositories";
import { resolveCommitSha } from "#/lib/knowledge/connected-repositories";
import { generateKnowledge } from "#/lib/knowledge/generate-knowledge";

const resolveOrgId = vi.fn();

/** What the mocked conversation-history hook reports; tests mutate it. */
const connected: { repositories: RepoCandidate[]; isLoading: boolean } = {
  repositories: [],
  isLoading: false,
};

vi.mock("#/lib/knowledge/connected-repositories", () => ({
  // A fresh array (and fresh candidate objects) on every render, exactly
  // like the real hook after each 10s conversation-list refetch.
  useConnectedRepositories: () => ({
    repositories: connected.repositories.map((candidate) => ({
      ...candidate,
    })),
    isLoading: connected.isLoading,
  }),
  resolveCommitSha: vi.fn(),
}));

vi.mock("#/lib/knowledge/generate-knowledge", () => ({
  generateKnowledge: vi.fn(),
}));

vi.mock("#/lib/data-platform/repositories/repository-identity", () => ({
  resolveOrgId: () => resolveOrgId(),
  findRepositoryUuid: vi.fn(),
}));

vi.mock("#/lib/data-platform/repositories/knowledge-repository", () => ({
  knowledgePersistenceRepository: {
    getLatestGenerationForRepository: vi.fn(),
  },
}));

const REPOSITORY_ID = "acme/api@main";

function seedFailedGeneration(error: string) {
  useKnowledgeStore.setState({
    byRepositoryId: {
      [REPOSITORY_ID]: {
        snapshot: {
          repositoryId: REPOSITORY_ID,
          owner: "acme",
          repo: "api",
          branch: "main",
          commitSha: "abcdef1234567890",
          localPath: "/workspace/api",
        },
        conversationUrl: null,
        sessionApiKey: null,
        status: "error",
        progress: null,
        lastNonTerminalStatus: null,
        knowledge: null,
        error,
        qualityFlags: [],
        refreshCadence: "manual",
      },
    },
  });
}

describe("KtRepository", () => {
  beforeEach(() => {
    useParamsMock.mockReturnValue({
      repositoryId: encodeURIComponent(REPOSITORY_ID),
    } as never);
    useKnowledgeStore.setState({ byRepositoryId: {} });
    resolveOrgId.mockResolvedValue(null);
    connected.repositories = [];
    connected.isLoading = false;
  });

  afterEach(() => {
    useKnowledgeStore.setState({ byRepositoryId: {} });
    vi.clearAllMocks();
  });

  it("shows why generation failed instead of 'not generated yet'", async () => {
    seedFailedGeneration("DeepWiki refused the request: rate limited.");

    renderWithProviders(<KtRepository />);

    expect(await screen.findByTestId("kt-repository-error")).toHaveTextContent(
      "DeepWiki refused the request: rate limited.",
    );
    expect(screen.queryByText(I18nKey.KT$NOT_FOUND)).not.toBeInTheDocument();
  });

  it("keeps waiting on the live conversation across conversation-list refetches", async () => {
    connected.repositories = [
      {
        repositoryId: REPOSITORY_ID,
        owner: "acme",
        repo: "api",
        branch: "main",
        conversationUrl: "http://localhost:3000/conversations/c1",
        sessionApiKey: "key",
        workingDir: "/workspace/api",
      },
    ];
    let finishClone: (sha: string) => void = () => {};
    vi.mocked(resolveCommitSha).mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finishClone = resolve;
        }),
    );
    // Mirrors the real generateKnowledge: it never resolves until the
    // attempt is genuinely settled (setReady/setError), so `startGenerating`
    // alone must not be read as "done" -- see the "still shows the starting
    // spinner while startGenerating has fired but nothing has landed yet"
    // test below for that exact distinction.
    vi.mocked(generateKnowledge).mockImplementation(
      async (snapshot, conversationUrl, sessionApiKey, store) => {
        store.startGenerating(snapshot, conversationUrl, sessionApiKey);
        store.setReady(snapshot.repositoryId, {
          repositoryId: snapshot.repositoryId,
          commitSha: snapshot.commitSha,
          title: "API",
          summary: "",
          sections: [],
          pages: [],
          generatedAt: new Date().toISOString(),
        });
      },
    );

    const { rerender } = renderWithProviders(<KtRepository />);
    await waitFor(() => expect(resolveCommitSha).toHaveBeenCalledTimes(1));
    expect(screen.getByText(I18nKey.KT$STARTING)).toBeInTheDocument();

    // Two background refetches land while the clone is still running.
    rerender(<KtRepository />);
    rerender(<KtRepository />);
    finishClone("0123456789abcdef");

    await waitFor(() =>
      expect(generateKnowledge).toHaveBeenCalledWith(
        expect.objectContaining({
          repositoryId: REPOSITORY_ID,
          commitSha: "0123456789abcdef",
          localPath: "/workspace/api",
        }),
        "http://localhost:3000/conversations/c1",
        "key",
        expect.anything(),
        expect.any(Function),
        {},
        expect.any(String),
      ),
    );
    expect(resolveCommitSha).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(I18nKey.KT$STARTING)).not.toBeInTheDocument();
  });

  it("keeps showing the starting spinner, not 'not found', while generation is under way but nothing has landed yet", async () => {
    connected.repositories = [
      {
        repositoryId: REPOSITORY_ID,
        owner: "acme",
        repo: "api",
        branch: "main",
        conversationUrl: "http://localhost:3000/conversations/c1",
        sessionApiKey: "key",
        workingDir: "/workspace/api",
      },
    ];
    vi.mocked(resolveCommitSha).mockResolvedValue("0123456789abcdef");
    // Never settles within this test -- `startGenerating` fires (the entry
    // now exists) but neither `setReady` nor `setError` is ever called, so
    // the page must keep waiting instead of reporting "not found" just
    // because an entry now exists.
    vi.mocked(generateKnowledge).mockImplementation(
      async (snapshot, conversationUrl, sessionApiKey, store) => {
        store.startGenerating(snapshot, conversationUrl, sessionApiKey);
        await new Promise(() => {});
      },
    );

    renderWithProviders(<KtRepository />);

    await waitFor(() =>
      expect(
        useKnowledgeStore.getState().byRepositoryId[REPOSITORY_ID]?.status,
      ).toBe("generating"),
    );
    expect(screen.getByText(I18nKey.KT$STARTING)).toBeInTheDocument();
    expect(screen.queryByText(I18nKey.KT$NOT_FOUND)).not.toBeInTheDocument();
  });

  it("doesn't flash 'not found' for a new repository while the route component is reused", async () => {
    // This route (`kt/:repositoryId`) is reused across navigations between
    // repositories -- React doesn't remount just because the param changed.
    seedFailedGeneration("boom");
    const { rerender } = renderWithProviders(<KtRepository />);
    expect(await screen.findByTestId("kt-repository-error")).toBeInTheDocument();

    let resolveOrg: (value: string | null) => void = () => {};
    resolveOrgId.mockImplementation(
      () =>
        new Promise<string | null>((resolve) => {
          resolveOrg = resolve;
        }),
    );
    const OTHER_REPOSITORY_ID = "acme/web@main";
    useParamsMock.mockReturnValue({
      repositoryId: encodeURIComponent(OTHER_REPOSITORY_ID),
    } as never);
    rerender(<KtRepository />);

    // Regression: the new repository's own rehydration attempt hasn't
    // settled yet, so this must show the loading state -- not a stale
    // "not found" left over from the previous repository already having
    // settled `checked: true`.
    expect(screen.getByText(I18nKey.KT$STARTING)).toBeInTheDocument();
    expect(screen.queryByText(I18nKey.KT$NOT_FOUND)).not.toBeInTheDocument();

    resolveOrg(null);
    expect(await screen.findByText(I18nKey.KT$NOT_FOUND)).toBeInTheDocument();
  });

  it("flags a page with weak source grounding instead of showing it unmarked", async () => {
    useKnowledgeStore.setState({
      byRepositoryId: {
        [REPOSITORY_ID]: {
          snapshot: {
            repositoryId: REPOSITORY_ID,
            owner: "acme",
            repo: "api",
            branch: "main",
            commitSha: "abcdef1234567890",
            localPath: "/workspace/api",
          },
          conversationUrl: null,
          sessionApiKey: null,
          status: "ready",
          progress: null,
          lastNonTerminalStatus: null,
          knowledge: {
            repositoryId: REPOSITORY_ID,
            commitSha: "abcdef1234567890",
            title: "API",
            summary: "",
            sections: [{ id: "s1", title: "Overview", pageIds: ["page-a"] }],
            pages: [
              {
                id: "page-a",
                title: "Page A",
                description: "",
                contentMarkdown: "# Page A",
                importance: "medium",
                relevantFiles: [],
                diagrams: [],
                relatedPageIds: [],
              },
            ],
            generatedAt: new Date().toISOString(),
          },
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

    renderWithProviders(<KtRepository />);

    expect(
      await screen.findByLabelText(I18nKey.KT$QUALITY_FLAG_BADGE),
    ).toBeInTheDocument();
  });

  it("falls back to the empty state when cold rehydration rejects", async () => {
    const rejections: unknown[] = [];
    const onUnhandled = (reason: unknown) => rejections.push(reason);
    process.on("unhandledRejection", onUnhandled);
    resolveOrgId.mockRejectedValue(new Error("supabase unreachable"));

    try {
      renderWithProviders(<KtRepository />);

      expect(await screen.findByText(I18nKey.KT$NOT_FOUND)).toBeInTheDocument();
      await waitFor(() => expect(rejections).toHaveLength(0));
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
