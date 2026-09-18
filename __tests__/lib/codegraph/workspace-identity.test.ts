import { afterEach, describe, expect, it, vi } from "vitest";
import AgentServerGitService from "#/api/git-service/agent-server-git-service.api";
import {
  resolveHeadCommitSha,
  workspaceIdForSnapshot,
} from "#/lib/codegraph/workspace-identity";
import type { RepositorySnapshot } from "#/lib/knowledge/knowledge-engine";

function snapshot(overrides: Partial<RepositorySnapshot> = {}): RepositorySnapshot {
  return {
    repositoryId: "acme/app",
    owner: "acme",
    repo: "app",
    branch: "main",
    commitSha: "abc1234",
    localPath: "/workspace/project",
    ...overrides,
  };
}

describe("workspaceIdForSnapshot", () => {
  it("uses the checkout's local path as the workspace id", () => {
    expect(workspaceIdForSnapshot(snapshot({ localPath: "/tmp/foo/bar" }))).toBe(
      "/tmp/foo/bar",
    );
  });
});

describe("resolveHeadCommitSha", () => {
  const getGitCommitsSpy = vi.spyOn(AgentServerGitService, "getGitCommits");

  afterEach(() => {
    getGitCommitsSpy.mockReset();
  });

  it("returns the sha of the most recent commit", async () => {
    getGitCommitsSpy.mockResolvedValue({
      commits: [
        {
          sha: "deadbeef",
          shortSha: "dead",
          subject: "fix",
          author: "a",
          timestamp: "2026-01-01T00:00:00Z",
        },
      ],
      hasMore: false,
    });

    const sha = await resolveHeadCommitSha(snapshot(), "http://conv", "key");

    expect(sha).toBe("deadbeef");
    expect(getGitCommitsSpy).toHaveBeenCalledWith(
      "http://conv",
      "key",
      "/workspace/project",
    );
  });

  it("returns null rather than throwing when HEAD cannot be resolved", async () => {
    getGitCommitsSpy.mockResolvedValue({ commits: [], hasMore: false });

    expect(await resolveHeadCommitSha(snapshot(), null, null)).toBeNull();
  });

  it("returns null when the git call rejects, instead of blocking the graph", async () => {
    getGitCommitsSpy.mockRejectedValue(new Error("network down"));

    expect(await resolveHeadCommitSha(snapshot(), null, null)).toBeNull();
  });
});
