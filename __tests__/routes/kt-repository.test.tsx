import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders, useParamsMock } from "test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KtRepository from "#/routes/kt-repository";
import { I18nKey } from "#/i18n/declaration";
import { useKnowledgeStore } from "#/stores/knowledge-store";

const resolveOrgId = vi.fn();

vi.mock("#/lib/knowledge/connected-repositories", () => ({
  useConnectedRepositories: () => ({
    repositories: [],
    isLoading: false,
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

  it("falls back to the empty state when cold rehydration rejects", async () => {
    const rejections: unknown[] = [];
    const onUnhandled = (reason: unknown) => rejections.push(reason);
    process.on("unhandledRejection", onUnhandled);
    resolveOrgId.mockRejectedValue(new Error("supabase unreachable"));

    try {
      renderWithProviders(<KtRepository />);

      expect(
        await screen.findByText(I18nKey.KT$NOT_FOUND),
      ).toBeInTheDocument();
      await waitFor(() => expect(rejections).toHaveLength(0));
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
