import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RepositorySnapshot } from "#/lib/knowledge/knowledge-engine";

const state = vi.hoisted(() => ({
  localConnected: true,
  credential: null as { token: string; host: string } | null,
}));

vi.mock("#/api/git-service/github-connection-flag", () => ({
  isLocalGithubConnected: () => state.localConnected,
}));

const mintGithubCloneToken = vi.fn();
vi.mock("#/api/git-service/mint-local-github-clone-credential", () => ({
  mintGithubCloneToken: (...args: unknown[]) => mintGithubCloneToken(...args),
}));

const { resolveDeepWikiRepoTarget } = await import(
  "#/lib/knowledge/deepwiki-repo-target"
);

const snapshot: RepositorySnapshot = {
  repositoryId: "acme/api@main",
  owner: "acme",
  repo: "api",
  branch: "main",
  commitSha: "abc123",
  localPath: "/workspace/api",
};

describe("resolveDeepWikiRepoTarget", () => {
  beforeEach(() => {
    state.localConnected = true;
    state.credential = { token: "gh-token-123", host: "github.com" };
    mintGithubCloneToken.mockReset();
    mintGithubCloneToken.mockImplementation(async () => state.credential);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("clones by URL with a minted token when a local GitHub connection exists", async () => {
    await expect(resolveDeepWikiRepoTarget(snapshot)).resolves.toEqual({
      repo_url: "https://github.com/acme/api",
      type: "github",
      token: "gh-token-123",
    });
  });

  it("falls back to the local path when there is no GitHub connection", async () => {
    state.localConnected = false;
    await expect(resolveDeepWikiRepoTarget(snapshot)).resolves.toEqual({
      repo_url: "/workspace/api",
      type: "local",
    });
    expect(mintGithubCloneToken).not.toHaveBeenCalled();
  });

  it("falls back to the local path when minting the token fails", async () => {
    state.credential = null;
    await expect(resolveDeepWikiRepoTarget(snapshot)).resolves.toEqual({
      repo_url: "/workspace/api",
      type: "local",
    });
  });

  it("never attempts a GitHub clone for a folder-only local workspace", async () => {
    await expect(
      resolveDeepWikiRepoTarget({ ...snapshot, owner: "local" }),
    ).resolves.toEqual({
      repo_url: "/workspace/api",
      type: "local",
    });
    expect(mintGithubCloneToken).not.toHaveBeenCalled();
  });
});
