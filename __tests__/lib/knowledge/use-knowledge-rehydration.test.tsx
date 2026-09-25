import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useKnowledgeStore } from "#/stores/knowledge-store";
import type { KnowledgeRepository } from "#/lib/knowledge/knowledge-engine";

const useActiveBackendMock = vi.fn();
vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => useActiveBackendMock(),
}));

const resolveOrgId = vi.fn();
const findRepositoryUuid = vi.fn();
vi.mock("#/lib/data-platform/repositories/repository-identity", () => ({
  resolveOrgId: (...args: unknown[]) => resolveOrgId(...args),
  findRepositoryUuid: (...args: unknown[]) => findRepositoryUuid(...args),
}));

const getLatestGenerationForRepository = vi.fn();
vi.mock("#/lib/data-platform/repositories/knowledge-repository", () => ({
  knowledgePersistenceRepository: {
    getLatestGenerationForRepository: (...args: unknown[]) =>
      getLatestGenerationForRepository(...args),
  },
}));

const useConnectedRepositoriesMock = vi.fn();
const resolveCommitSha = vi.fn();
vi.mock("#/lib/knowledge/connected-repositories", () => ({
  useConnectedRepositories: () => useConnectedRepositoriesMock(),
  resolveCommitSha: (...args: unknown[]) => resolveCommitSha(...args),
}));

const generateKnowledge = vi.fn();
vi.mock("#/lib/knowledge/generate-knowledge", () => ({
  generateKnowledge: (...args: unknown[]) => generateKnowledge(...args),
}));

const { useKnowledgeRehydration } =
  await import("#/lib/knowledge/use-knowledge-rehydration");

const repositoryId = "acme/api@main";

function persistedKnowledge(): KnowledgeRepository {
  return {
    repositoryId,
    commitSha: "persisted-sha",
    title: "Acme API",
    summary: "",
    sections: [],
    pages: [],
    generatedAt: new Date().toISOString(),
  };
}

describe("useKnowledgeRehydration", () => {
  beforeEach(() => {
    useKnowledgeStore.getState().reset();
    useActiveBackendMock.mockReset().mockReturnValue({
      backend: { id: "backend-1", name: "Local", host: "", kind: "local" },
      orgId: null,
    });
    resolveOrgId.mockReset();
    findRepositoryUuid.mockReset();
    getLatestGenerationForRepository.mockReset();
    useConnectedRepositoriesMock
      .mockReset()
      .mockReturnValue({ repositories: [], isLoading: false, isError: false });
    resolveCommitSha.mockReset();
    generateKnowledge.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reports checked immediately when there is no repositoryId to resolve", () => {
    const { result } = renderHook(() => useKnowledgeRehydration(undefined));

    expect(result.current).toBe(true);
    expect(resolveOrgId).not.toHaveBeenCalled();
  });

  it("reports checked without hydrating when the repositoryId doesn't parse as owner/repo@branch", async () => {
    const { result } = renderHook(() =>
      useKnowledgeRehydration("not-a-valid-id"),
    );

    await waitFor(() => expect(result.current).toBe(true));
    expect(resolveOrgId).not.toHaveBeenCalled();
    expect(
      useKnowledgeStore.getState().byRepositoryId["not-a-valid-id"],
    ).toBeUndefined();
  });

  it("stays unchecked while the connected-repositories query is still loading and no live match is known yet", () => {
    useConnectedRepositoriesMock.mockReturnValue({
      repositories: [],
      isLoading: true,
      isError: false,
    });

    const { result } = renderHook(() => useKnowledgeRehydration(repositoryId));

    expect(result.current).toBe(false);
    expect(resolveOrgId).not.toHaveBeenCalled();
  });

  it("runs live generation for an open conversation and never falls back to cold rehydration when it succeeds", async () => {
    useConnectedRepositoriesMock.mockReturnValue({
      repositories: [
        {
          repositoryId,
          owner: "acme",
          repo: "api",
          branch: "main",
          conversationUrl: "https://conversation.example",
          sessionApiKey: "session-key",
          workingDir: "/workspace/acme-api",
        },
      ],
      isLoading: false,
      isError: false,
    });
    resolveCommitSha.mockResolvedValue("live-sha");
    generateKnowledge.mockImplementation(
      async (snapshot, _url, _key, store) => {
        store.startGenerating(
          snapshot,
          "https://conversation.example",
          "session-key",
        );
        store.setReady(snapshot.repositoryId, persistedKnowledge(), []);
      },
    );

    const { result } = renderHook(() => useKnowledgeRehydration(repositoryId));

    await waitFor(() => expect(result.current).toBe(true));
    expect(resolveCommitSha).toHaveBeenCalledWith(
      "acme",
      "api",
      "/workspace/acme-api",
      "https://conversation.example",
      "session-key",
    );
    expect(
      useKnowledgeStore.getState().byRepositoryId[repositoryId]?.status,
    ).toBe("ready");
    expect(resolveOrgId).not.toHaveBeenCalled();
  });

  it("falls through to cold rehydration when the live generation attempt errors", async () => {
    useConnectedRepositoriesMock.mockReturnValue({
      repositories: [
        {
          repositoryId,
          owner: "acme",
          repo: "api",
          branch: "main",
          conversationUrl: "https://conversation.example",
          sessionApiKey: "session-key",
          workingDir: "/workspace/acme-api",
        },
      ],
      isLoading: false,
      isError: false,
    });
    resolveCommitSha.mockResolvedValue("live-sha");
    generateKnowledge.mockImplementation(
      async (snapshot, _url, _key, store) => {
        store.startGenerating(
          snapshot,
          "https://conversation.example",
          "session-key",
        );
        store.setError(snapshot.repositoryId, "DeepWiki unreachable");
      },
    );
    resolveOrgId.mockResolvedValue("org-1");
    findRepositoryUuid.mockResolvedValue("repo-uuid");
    getLatestGenerationForRepository.mockResolvedValue(persistedKnowledge());

    const { result } = renderHook(() => useKnowledgeRehydration(repositoryId));

    await waitFor(() => expect(result.current).toBe(true));
    expect(getLatestGenerationForRepository).toHaveBeenCalledWith(
      "repo-uuid",
      "main",
    );
    const entry = useKnowledgeStore.getState().byRepositoryId[repositoryId];
    expect(entry?.status).toBe("ready");
    expect(entry?.knowledge?.commitSha).toBe("persisted-sha");
  });

  it("goes straight to cold rehydration when no live conversation exists for this repo", async () => {
    resolveOrgId.mockResolvedValue("org-1");
    findRepositoryUuid.mockResolvedValue("repo-uuid");
    getLatestGenerationForRepository.mockResolvedValue(persistedKnowledge());

    const { result } = renderHook(() => useKnowledgeRehydration(repositoryId));

    await waitFor(() => expect(result.current).toBe(true));
    expect(generateKnowledge).not.toHaveBeenCalled();
    expect(
      useKnowledgeStore.getState().byRepositoryId[repositoryId]?.knowledge
        ?.commitSha,
    ).toBe("persisted-sha");
  });

  it("leaves the store untouched and still reports checked when nothing was ever generated for this repo", async () => {
    resolveOrgId.mockResolvedValue("org-1");
    findRepositoryUuid.mockResolvedValue(null);

    const { result } = renderHook(() => useKnowledgeRehydration(repositoryId));

    await waitFor(() => expect(result.current).toBe(true));
    expect(getLatestGenerationForRepository).not.toHaveBeenCalled();
    expect(
      useKnowledgeStore.getState().byRepositoryId[repositoryId],
    ).toBeUndefined();
  });
});
