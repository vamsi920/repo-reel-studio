import type { DeepWikiRepoType } from "#/api/deepwiki-service/deepwiki-service.types";
import { isLocalGithubConnected } from "#/api/git-service/github-connection-flag";
import { mintGithubCloneToken } from "#/api/git-service/mint-local-github-clone-credential";
import type { RepositorySnapshot } from "./knowledge-engine";

export interface DeepWikiRepoTarget {
  repo_url: string;
  type: DeepWikiRepoType;
  token?: string;
}

/**
 * DeepWiki runs as its own Fly machine in production, with no filesystem
 * shared with the agent-server sandbox that checked the repo out (see
 * docs/deepwiki-video-kt-integration.md §8) -- `type: "local"` there just
 * hands DeepWiki a path that doesn't exist on its machine, and it silently
 * indexes 0 files. When this snapshot is a real GitHub repo (not a
 * folder-only local workspace, which has no remote to clone) and the user
 * has a locally-connected GitHub account, clone it directly instead with a
 * short-lived scoped token, so DeepWiki no longer depends on that shared
 * filesystem at all. Falls back to the old same-filesystem path (`type:
 * "local"`) whenever no such token can be minted -- local dev, a folder-only
 * workspace, or no GitHub connection -- so that mode keeps working exactly
 * as before.
 */
export async function resolveDeepWikiRepoTarget(
  snapshot: RepositorySnapshot,
): Promise<DeepWikiRepoTarget> {
  if (snapshot.owner !== "local" && isLocalGithubConnected()) {
    const credential = await mintGithubCloneToken();
    if (credential) {
      return {
        repo_url: `https://${credential.host}/${snapshot.owner}/${snapshot.repo}`,
        type: "github",
        token: credential.token,
      };
    }
  }
  return { repo_url: snapshot.localPath, type: "local" };
}
