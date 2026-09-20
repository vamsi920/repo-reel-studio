import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisHandle } from "#/lib/codegraph/analyzer-runner";
import type {
  KnowledgeRepository,
  RepositorySnapshot,
} from "#/lib/knowledge/knowledge-engine";

const openExistingAnalysis = vi.fn();
const runAnalysis = vi.fn();
vi.mock("#/lib/codegraph/analyzer-runner", () => ({
  openExistingAnalysis: (...args: unknown[]) => openExistingAnalysis(...args),
  runAnalysis: (...args: unknown[]) => runAnalysis(...args),
}));

const toSubsystemHints = vi.fn((..._args: unknown[]) => []);
vi.mock("#/lib/codegraph/deepwiki-bridge", () => ({
  toSubsystemHints: (...args: unknown[]) => toSubsystemHints(...args),
}));

const { ensureCodeEvidence, upgradeCodeEvidenceInBackground } = await import(
  "#/lib/knowledge/pre-analysis"
);

const snapshot: RepositorySnapshot = {
  repositoryId: "acme/api@main",
  owner: "acme",
  repo: "api",
  branch: "main",
  commitSha: "abc123",
  localPath: "/workspace/acme-api",
};

function stubHandle(): AnalysisHandle {
  return {
    meta: {
      workspaceId: "/workspace/acme-api",
      repositoryId: "acme/api@main",
      commitSha: "abc123",
      generatedAt: new Date().toISOString(),
      fileCount: 10,
      symbolCount: 20,
      languages: ["TypeScript"],
      frameworks: [],
    },
    root: { parentId: null, nodes: [], edges: [], crumbs: [] },
    loadLevel: async () => null,
    loadSearchIndex: async () => [],
    readSource: async () => null,
  };
}

describe("ensureCodeEvidence", () => {
  beforeEach(() => {
    openExistingAnalysis.mockReset();
    runAnalysis.mockReset();
  });

  it("reuses an existing analysis for this commit without running a fresh one", async () => {
    const handle = stubHandle();
    openExistingAnalysis.mockResolvedValueOnce(handle);

    const result = await ensureCodeEvidence(
      snapshot,
      "https://conversation.example",
      "session-key",
    );

    expect(result?.handle).toBe(handle);
    expect(result?.summary.fileCount).toBe(10);
    expect(runAnalysis).not.toHaveBeenCalled();
  });

  it("falls back to a bounded fresh analyzer pass when nothing existing is cached", async () => {
    const handle = stubHandle();
    openExistingAnalysis.mockResolvedValueOnce(null);
    runAnalysis.mockResolvedValueOnce(handle);

    const result = await ensureCodeEvidence(snapshot, null, null);

    expect(result?.handle).toBe(handle);
    expect(runAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot,
        hints: [],
        timeoutSeconds: 120,
        storageIds: null,
      }),
    );
  });

  it("resolves to null instead of throwing when the analyzer pass rejects", async () => {
    openExistingAnalysis.mockRejectedValueOnce(new Error("sandbox timeout"));

    const result = await ensureCodeEvidence(snapshot, null, null);

    expect(result).toBeNull();
  });

  it("resolves to null when neither an existing nor a fresh analysis is found", async () => {
    openExistingAnalysis.mockResolvedValueOnce(null);
    runAnalysis.mockResolvedValueOnce(null);

    const result = await ensureCodeEvidence(snapshot, null, null);

    expect(result).toBeNull();
  });
});

describe("upgradeCodeEvidenceInBackground", () => {
  beforeEach(() => {
    runAnalysis.mockReset();
    toSubsystemHints.mockClear();
  });

  it("fires a hinted re-analysis without waiting for its result", () => {
    runAnalysis.mockResolvedValueOnce(stubHandle());
    const knowledge = {} as KnowledgeRepository;

    upgradeCodeEvidenceInBackground(snapshot, null, null, knowledge);

    expect(toSubsystemHints).toHaveBeenCalledWith(knowledge);
    expect(runAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ snapshot, storageIds: null }),
    );
  });

  it("swallows a rejected background re-analysis instead of throwing", () => {
    runAnalysis.mockRejectedValueOnce(new Error("boom"));

    expect(() =>
      upgradeCodeEvidenceInBackground(
        snapshot,
        null,
        null,
        {} as KnowledgeRepository,
      ),
    ).not.toThrow();
  });
});
