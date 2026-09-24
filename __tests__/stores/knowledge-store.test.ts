import { beforeEach, describe, expect, it } from "vitest";

import { useKnowledgeStore } from "#/stores/knowledge-store";
import type { RepositorySnapshot } from "#/lib/knowledge/knowledge-engine";
import type { DeepWikiWikiTaskStatus } from "#/api/deepwiki-service/deepwiki-service.types";

const snapshot: RepositorySnapshot = {
  repositoryId: "repo-1",
  owner: "acme",
  repo: "widgets",
  branch: "main",
  commitSha: "abc123",
  localPath: "/workspace/widgets",
};

function taskStatus(
  status: DeepWikiWikiTaskStatus["status"],
): DeepWikiWikiTaskStatus {
  return {
    id: "task-1",
    owner: "acme",
    repo: "widgets",
    repo_type: "github",
    language: "en",
    status,
    pages_done: 0,
    pages_total: 0,
    current_page_ids: [],
    error: status === "failed" ? "boom" : null,
    submitted_at: 0,
    name: "widgets",
    wiki_structure: null,
  };
}

describe("useKnowledgeStore setProgress", () => {
  beforeEach(() => {
    useKnowledgeStore.setState({ byRepositoryId: {} });
    useKnowledgeStore
      .getState()
      .startGenerating(snapshot, "https://example.test", "key");
  });

  it("starts with no last-non-terminal status recorded", () => {
    const state =
      useKnowledgeStore.getState().byRepositoryId[snapshot.repositoryId];
    expect(state.lastNonTerminalStatus).toBeNull();
  });

  it("tracks the most recent non-terminal status as progress ticks come in", () => {
    const { setProgress } = useKnowledgeStore.getState();
    setProgress(snapshot.repositoryId, taskStatus("indexing"));
    setProgress(snapshot.repositoryId, taskStatus("determining_structure"));

    const state =
      useKnowledgeStore.getState().byRepositoryId[snapshot.repositoryId];
    expect(state.lastNonTerminalStatus).toBe("determining_structure");
  });

  it("keeps the last non-terminal status once the task fails, instead of losing it", () => {
    const { setProgress } = useKnowledgeStore.getState();
    setProgress(snapshot.repositoryId, taskStatus("indexing"));
    setProgress(snapshot.repositoryId, taskStatus("failed"));

    const state =
      useKnowledgeStore.getState().byRepositoryId[snapshot.repositoryId];
    expect(state.progress?.status).toBe("failed");
    expect(state.lastNonTerminalStatus).toBe("indexing");
  });

  it("does not treat 'completed' as a status worth remembering as non-terminal", () => {
    const { setProgress } = useKnowledgeStore.getState();
    setProgress(snapshot.repositoryId, taskStatus("generating"));
    setProgress(snapshot.repositoryId, taskStatus("completed"));

    const state =
      useKnowledgeStore.getState().byRepositoryId[snapshot.repositoryId];
    expect(state.lastNonTerminalStatus).toBe("generating");
  });
});

describe("useKnowledgeStore startGenerating", () => {
  beforeEach(() => {
    useKnowledgeStore.setState({ byRepositoryId: {} });
  });

  it("keeps the previous result visible while a regeneration is in flight", () => {
    const { startGenerating, setReady } = useKnowledgeStore.getState();
    const knowledge = {
      repositoryId: snapshot.repositoryId,
      commitSha: "abc123",
      title: "Widgets",
      summary: "",
      sections: [],
      pages: [],
      generatedAt: "2026-01-01T00:00:00.000Z",
    };
    const qualityFlags = [
      { pageId: "page-a", kind: "no-citations" as const, detail: "no cites" },
    ];
    startGenerating(snapshot, "https://example.test", "key");
    setReady(snapshot.repositoryId, knowledge, qualityFlags);

    // User clicks "Regenerate" on an already-generated repo.
    startGenerating(snapshot, "https://example.test", "key");

    const state =
      useKnowledgeStore.getState().byRepositoryId[snapshot.repositoryId];
    expect(state.status).toBe("generating");
    expect(state.knowledge).toBe(knowledge);
    expect(state.qualityFlags).toBe(qualityFlags);
  });

  it("starts with no knowledge for a repository that has never generated before", () => {
    const { startGenerating } = useKnowledgeStore.getState();
    startGenerating(snapshot, "https://example.test", "key");

    const state =
      useKnowledgeStore.getState().byRepositoryId[snapshot.repositoryId];
    expect(state.knowledge).toBeNull();
    expect(state.qualityFlags).toEqual([]);
  });
});

// Regression: two independent flows can target the same repositoryId (e.g.
// a RepoCard's "Generate" and a second "Add Repository" pass for the same
// owner/repo/branch). Before `startGenerating` returned an attempt token,
// whichever attempt's `setReady`/`setProgress`/`setError` happened to land
// last always won, even an older attempt settling after a newer one had
// already gone "ready" -- silently overwriting fresh content with stale
// content and no way to detect it happened.
describe("useKnowledgeStore concurrent generation attempts", () => {
  beforeEach(() => {
    useKnowledgeStore.setState({ byRepositoryId: {} });
  });

  it("drops a stale attempt's setReady once a newer attempt has started", () => {
    const { startGenerating, setReady } = useKnowledgeStore.getState();
    const staleAttempt = startGenerating(
      snapshot,
      "https://example.test",
      "key",
    );
    // A second flow starts a fresh attempt for the identical repositoryId
    // before the first one's async work resolves.
    startGenerating(snapshot, "https://example.test", "key");

    const staleKnowledge = {
      repositoryId: snapshot.repositoryId,
      commitSha: "stale-sha",
      title: "Stale",
      summary: "",
      sections: [],
      pages: [],
      generatedAt: "2026-01-01T00:00:00.000Z",
    };
    // The older attempt's DeepWiki call finally resolves.
    setReady(snapshot.repositoryId, staleKnowledge, [], staleAttempt);

    const state =
      useKnowledgeStore.getState().byRepositoryId[snapshot.repositoryId];
    expect(state.status).toBe("generating");
    expect(state.knowledge).toBeNull();
  });

  it("drops a stale attempt's setProgress and setError the same way", () => {
    const { startGenerating, setProgress, setError } =
      useKnowledgeStore.getState();
    const staleAttempt = startGenerating(
      snapshot,
      "https://example.test",
      "key",
    );
    startGenerating(snapshot, "https://example.test", "key");

    setProgress(snapshot.repositoryId, taskStatus("indexing"), staleAttempt);
    setError(snapshot.repositoryId, "stale failure", staleAttempt);

    const state =
      useKnowledgeStore.getState().byRepositoryId[snapshot.repositoryId];
    expect(state.status).toBe("generating");
    expect(state.progress).toBeNull();
    expect(state.error).toBeNull();
  });

  it("still applies the current attempt's writes", () => {
    const { startGenerating, setReady } = useKnowledgeStore.getState();
    const attempt = startGenerating(snapshot, "https://example.test", "key");
    const knowledge = {
      repositoryId: snapshot.repositoryId,
      commitSha: "fresh-sha",
      title: "Fresh",
      summary: "",
      sections: [],
      pages: [],
      generatedAt: "2026-01-01T00:00:00.000Z",
    };

    setReady(snapshot.repositoryId, knowledge, [], attempt);

    const state =
      useKnowledgeStore.getState().byRepositoryId[snapshot.repositoryId];
    expect(state.status).toBe("ready");
    expect(state.knowledge).toBe(knowledge);
  });

  it("applies a write with no attempt token unconditionally, for callers that don't track one", () => {
    const { startGenerating, setReady } = useKnowledgeStore.getState();
    startGenerating(snapshot, "https://example.test", "key");
    startGenerating(snapshot, "https://example.test", "key");
    const knowledge = {
      repositoryId: snapshot.repositoryId,
      commitSha: "untracked-sha",
      title: "Untracked",
      summary: "",
      sections: [],
      pages: [],
      generatedAt: "2026-01-01T00:00:00.000Z",
    };

    setReady(snapshot.repositoryId, knowledge);

    const state =
      useKnowledgeStore.getState().byRepositoryId[snapshot.repositoryId];
    expect(state.status).toBe("ready");
    expect(state.knowledge).toBe(knowledge);
  });
});

describe("useKnowledgeStore reset", () => {
  it("drops every in-memory entry, including provisioning state", () => {
    const {
      startGenerating,
      startProvisioning,
      reset: resetStore,
    } = useKnowledgeStore.getState();
    startGenerating(snapshot, "https://example.test", "key");
    startProvisioning("acme/other@main", {
      owner: "acme",
      repo: "other",
      branch: "main",
    });
    expect(
      useKnowledgeStore.getState().byRepositoryId[snapshot.repositoryId],
    ).toBeDefined();
    expect(
      useKnowledgeStore.getState().provisioningByRepositoryId[
        "acme/other@main"
      ],
    ).toBeDefined();

    resetStore();

    expect(useKnowledgeStore.getState().byRepositoryId).toEqual({});
    expect(useKnowledgeStore.getState().provisioningByRepositoryId).toEqual(
      {},
    );
  });
});
