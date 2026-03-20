import type { GitNexusGraphData, RepoKnowledgeGraph, VideoManifest } from "./types";

interface ProjectWorkspaceSnapshot {
  id?: string | null;
  repo_url?: string | null;
  manifest?: VideoManifest | null;
  repo_content?: string | null;
  graph_data?: GitNexusGraphData | null;
  repo_knowledge_graph?: RepoKnowledgeGraph | null;
}

function tryWriteSession(key: string, value: string | null | undefined) {
  try {
    if (value === null || value === undefined || value === "") {
      sessionStorage.removeItem(key);
      return;
    }
    sessionStorage.setItem(key, value);
  } catch {
    // Session storage is a compatibility cache only.
  }
}

export function syncProjectWorkspaceToSession(
  snapshot: ProjectWorkspaceSnapshot
) {
  tryWriteSession("project-id", snapshot.id || null);
  tryWriteSession("repo-url", snapshot.repo_url || null);

  if (snapshot.manifest === null) {
    tryWriteSession("video-manifest", null);
  } else if (snapshot.manifest) {
    tryWriteSession("video-manifest", JSON.stringify(snapshot.manifest));
  }

  if (snapshot.repo_content !== undefined) {
    tryWriteSession("repo-content", snapshot.repo_content);
  }

  if (snapshot.graph_data !== undefined) {
    tryWriteSession(
      "graph-data",
      snapshot.graph_data ? JSON.stringify(snapshot.graph_data) : null
    );
  }

  const knowledgeGraph =
    snapshot.repo_knowledge_graph || snapshot.manifest?.knowledge_graph;
  if (knowledgeGraph) {
    tryWriteSession("repo-knowledge-graph", JSON.stringify(knowledgeGraph));
  } else if (snapshot.repo_knowledge_graph === null || snapshot.manifest === null) {
    tryWriteSession("repo-knowledge-graph", null);
  }
}

export function clearProjectWorkspaceSession() {
  [
    "project-id",
    "repo-url",
    "video-manifest",
    "repo-content",
    "graph-data",
    "repo-knowledge-graph",
    "processing-error",
  ].forEach((key) => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Ignore unavailable session storage.
    }
  });
}
