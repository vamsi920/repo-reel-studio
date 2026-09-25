import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  KnowledgeRepository,
  RepositorySnapshot,
} from "#/lib/knowledge/knowledge-engine";

const { engineGenerate, engineCtor } = vi.hoisted(() => ({
  engineGenerate: vi.fn(),
  engineCtor: vi.fn(),
}));
vi.mock("#/lib/knowledge/knowledge-engine", () => ({
  DeepWikiKnowledgeEngine: class {
    constructor(options: unknown) {
      engineCtor(options);
    }

    generate(...args: unknown[]) {
      return engineGenerate(...args);
    }
  },
}));

const ensureCodeEvidence = vi.fn();
const upgradeCodeEvidenceInBackground = vi.fn();
vi.mock("#/lib/knowledge/pre-analysis", () => ({
  ensureCodeEvidence: (...args: unknown[]) => ensureCodeEvidence(...args),
  upgradeCodeEvidenceInBackground: (...args: unknown[]) =>
    upgradeCodeEvidenceInBackground(...args),
}));

const reviewKnowledgeQuality = vi.fn();
vi.mock("#/lib/knowledge/quality-review", () => ({
  reviewKnowledgeQuality: (...args: unknown[]) =>
    reviewKnowledgeQuality(...args),
}));

const repairInvalidDiagrams = vi.fn();
vi.mock("#/lib/knowledge/mermaid-repair", () => ({
  repairInvalidDiagrams: (...args: unknown[]) => repairInvalidDiagrams(...args),
}));

const displayErrorToast = vi.fn();
vi.mock("#/utils/custom-toast-handlers", () => ({
  displayErrorToast: (...args: unknown[]) => displayErrorToast(...args),
}));

const resolvePersistenceIds = vi.fn();
vi.mock("#/lib/data-platform/repositories/repository-identity", () => ({
  resolvePersistenceIds: (...args: unknown[]) => resolvePersistenceIds(...args),
}));

const saveFullKnowledge = vi.fn();
vi.mock("#/lib/data-platform/repositories/knowledge-repository", () => ({
  knowledgePersistenceRepository: {
    saveFullKnowledge: (...args: unknown[]) => saveFullKnowledge(...args),
  },
}));

const { generateKnowledge } =
  await import("#/lib/knowledge/generate-knowledge");

const snapshot: RepositorySnapshot = {
  repositoryId: "acme/api@main",
  owner: "acme",
  repo: "api",
  branch: "main",
  commitSha: "abc123",
  localPath: "/workspace/acme-api",
};

function knowledge(
  overrides: Partial<KnowledgeRepository> = {},
): KnowledgeRepository {
  return {
    repositoryId: "acme/api@main",
    commitSha: "abc123",
    title: "Acme API",
    summary: "",
    sections: [],
    pages: [],
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function stubStore() {
  return {
    startGenerating: vi.fn().mockReturnValue(1),
    setProgress: vi.fn(),
    setReady: vi.fn(),
    setError: vi.fn(),
  };
}

describe("generateKnowledge", () => {
  beforeEach(() => {
    engineGenerate.mockReset();
    engineCtor.mockReset();
    ensureCodeEvidence.mockReset().mockResolvedValue(null);
    upgradeCodeEvidenceInBackground.mockReset();
    reviewKnowledgeQuality.mockReset().mockReturnValue([]);
    repairInvalidDiagrams.mockReset();
    displayErrorToast.mockReset();
    resolvePersistenceIds.mockReset();
    saveFullKnowledge.mockReset();
  });

  it("runs generation end to end and marks the store ready under the started attempt token", async () => {
    const raw = knowledge();
    engineGenerate.mockResolvedValue(raw);
    repairInvalidDiagrams.mockResolvedValue(raw);
    const store = stubStore();
    const navigate = vi.fn();

    await generateKnowledge(
      snapshot,
      "https://conversation.example",
      "session-key",
      store,
      navigate,
    );

    expect(store.startGenerating).toHaveBeenCalledWith(
      snapshot,
      "https://conversation.example",
      "session-key",
    );
    expect(store.setReady).toHaveBeenCalledWith(
      snapshot.repositoryId,
      raw,
      [],
      1,
    );
    expect(navigate).toHaveBeenCalledWith(
      `/kt/${encodeURIComponent(snapshot.repositoryId)}`,
    );
    expect(store.setError).not.toHaveBeenCalled();
  });

  it("records a store error and toasts instead of navigating when generation fails", async () => {
    engineGenerate.mockRejectedValue(new Error("DeepWiki unreachable"));
    const store = stubStore();
    const navigate = vi.fn();

    await generateKnowledge(snapshot, null, null, store, navigate);

    expect(store.setError).toHaveBeenCalledWith(
      snapshot.repositoryId,
      "DeepWiki unreachable",
      1,
    );
    expect(displayErrorToast).toHaveBeenCalledWith("DeepWiki unreachable");
    expect(navigate).not.toHaveBeenCalled();
    expect(store.setReady).not.toHaveBeenCalled();
  });

  it("falls back to the raw generation when the mermaid repair pass rejects", async () => {
    const raw = knowledge();
    engineGenerate.mockResolvedValue(raw);
    repairInvalidDiagrams.mockRejectedValue(new Error("repair network error"));
    const store = stubStore();

    await generateKnowledge(snapshot, null, null, store, vi.fn());

    expect(store.setReady).toHaveBeenCalledWith(
      snapshot.repositoryId,
      raw,
      [],
      1,
    );
  });

  it("passes real code-evidence through to generation and kicks off a background upgrade once ready", async () => {
    const raw = knowledge();
    engineGenerate.mockResolvedValue(raw);
    repairInvalidDiagrams.mockResolvedValue(raw);
    const evidence = {
      handle: { root: { nodes: [] } },
      summary: { rendered: "Repository: 10 files." },
      subsystems: [{ name: "api", filePaths: ["src/index.ts"] }],
    };
    ensureCodeEvidence.mockResolvedValue(evidence);
    const store = stubStore();

    await generateKnowledge(
      snapshot,
      "https://conversation.example",
      "session-key",
      store,
      vi.fn(),
    );

    expect(engineGenerate).toHaveBeenCalledWith(
      snapshot,
      expect.objectContaining({
        codeEvidence: "Repository: 10 files.",
        codeEvidenceSubsystems: evidence.subsystems,
      }),
    );
    expect(upgradeCodeEvidenceInBackground).toHaveBeenCalledWith(
      snapshot,
      "https://conversation.example",
      "session-key",
      raw,
    );
  });

  it("never resolves persistence ids when no backend is active", async () => {
    const raw = knowledge();
    engineGenerate.mockResolvedValue(raw);
    repairInvalidDiagrams.mockResolvedValue(raw);
    const store = stubStore();

    await generateKnowledge(snapshot, null, null, store, vi.fn(), {}, null);
    await Promise.resolve();

    expect(resolvePersistenceIds).not.toHaveBeenCalled();
    expect(saveFullKnowledge).not.toHaveBeenCalled();
  });

  it("persists the full generation once a backend id and real persistence ids are available", async () => {
    const raw = knowledge();
    engineGenerate.mockResolvedValue(raw);
    repairInvalidDiagrams.mockResolvedValue(raw);
    resolvePersistenceIds.mockResolvedValue({
      repositoryUuid: "repo-uuid",
      workspaceId: "workspace-uuid",
    });
    const store = stubStore();

    await generateKnowledge(
      snapshot,
      null,
      null,
      store,
      vi.fn(),
      {},
      "backend-1",
    );
    // queueKnowledgePersistence is fire-and-forget; flush its microtask chain.
    await Promise.resolve();
    await Promise.resolve();

    expect(resolvePersistenceIds).toHaveBeenCalledWith({
      owner: snapshot.owner,
      repo: snapshot.repo,
      branch: snapshot.branch,
      localPath: snapshot.localPath,
      backendId: "backend-1",
    });
    expect(saveFullKnowledge).toHaveBeenCalledWith(
      "repo-uuid",
      "workspace-uuid",
      snapshot.branch,
      raw,
    );
  });
});
