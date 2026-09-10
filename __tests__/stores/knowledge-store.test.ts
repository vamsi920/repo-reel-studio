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
