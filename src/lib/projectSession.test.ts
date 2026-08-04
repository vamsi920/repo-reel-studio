import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearProjectWorkspaceSession, syncProjectWorkspaceToSession } from "@/lib/projectSession";
import type { GitNexusGraphData, RepoKnowledgeGraph, VideoManifest } from "@/lib/types";

const manifest = { title: "demo", scenes: [] } as VideoManifest;
const graphData = { nodes: [], edges: [], clusters: [], processes: [] } as GitNexusGraphData;
const knowledgeGraph = { summary: { headline: "kg" } } as unknown as RepoKnowledgeGraph;

describe("syncProjectWorkspaceToSession", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("writes the workspace snapshot to session storage", () => {
    syncProjectWorkspaceToSession({
      id: "project-1",
      repo_url: "https://github.com/acme/demo",
      manifest,
      repo_content: "file: a.ts",
      graph_data: graphData,
      repo_knowledge_graph: knowledgeGraph,
    });

    expect(sessionStorage.getItem("project-id")).toBe("project-1");
    expect(sessionStorage.getItem("repo-url")).toBe("https://github.com/acme/demo");
    expect(sessionStorage.getItem("video-manifest")).toBe(JSON.stringify(manifest));
    expect(sessionStorage.getItem("repo-content")).toBe("file: a.ts");
    expect(sessionStorage.getItem("graph-data")).toBe(JSON.stringify(graphData));
    expect(sessionStorage.getItem("repo-knowledge-graph")).toBe(JSON.stringify(knowledgeGraph));
  });

  it("removes keys when values are explicitly null", () => {
    sessionStorage.setItem("project-id", "stale");
    sessionStorage.setItem("video-manifest", "stale");
    sessionStorage.setItem("graph-data", "stale");
    sessionStorage.setItem("repo-knowledge-graph", "stale");

    syncProjectWorkspaceToSession({
      id: null,
      manifest: null,
      graph_data: null,
      repo_knowledge_graph: null,
    });

    expect(sessionStorage.getItem("project-id")).toBeNull();
    expect(sessionStorage.getItem("video-manifest")).toBeNull();
    expect(sessionStorage.getItem("graph-data")).toBeNull();
    expect(sessionStorage.getItem("repo-knowledge-graph")).toBeNull();
  });

  it("leaves untouched keys alone when fields are undefined", () => {
    sessionStorage.setItem("repo-content", "kept");
    sessionStorage.setItem("graph-data", "kept");
    sessionStorage.setItem("video-manifest", "kept");

    syncProjectWorkspaceToSession({ id: "project-1" });

    expect(sessionStorage.getItem("repo-content")).toBe("kept");
    expect(sessionStorage.getItem("graph-data")).toBe("kept");
    expect(sessionStorage.getItem("video-manifest")).toBe("kept");
  });

  it("falls back to the knowledge graph embedded in the manifest", () => {
    syncProjectWorkspaceToSession({
      manifest: { ...manifest, knowledge_graph: knowledgeGraph },
    });

    expect(sessionStorage.getItem("repo-knowledge-graph")).toBe(JSON.stringify(knowledgeGraph));
  });

  it("swallows session storage failures", () => {
    const setItem = vi.spyOn(window.sessionStorage, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    expect(() => syncProjectWorkspaceToSession({ id: "project-1", manifest })).not.toThrow();

    setItem.mockRestore();
  });
});

describe("clearProjectWorkspaceSession", () => {
  it("removes every workspace key", () => {
    const keys = [
      "project-id",
      "repo-url",
      "video-manifest",
      "repo-content",
      "graph-data",
      "repo-knowledge-graph",
      "processing-error",
    ];
    keys.forEach((key) => sessionStorage.setItem(key, "stale"));
    sessionStorage.setItem("unrelated", "kept");

    clearProjectWorkspaceSession();

    keys.forEach((key) => expect(sessionStorage.getItem(key)).toBeNull());
    expect(sessionStorage.getItem("unrelated")).toBe("kept");
  });

  it("swallows session storage failures", () => {
    const removeItem = vi.spyOn(window.sessionStorage, "removeItem").mockImplementation(() => {
      throw new Error("unavailable");
    });

    expect(() => clearProjectWorkspaceSession()).not.toThrow();

    removeItem.mockRestore();
  });
});
