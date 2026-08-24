/**
 * Ties a CodeGraph to the workspace and commit it actually describes.
 *
 * Graphs are keyed by `workspaceId` + `repositoryId` + `commitSha`. The first
 * two come straight off the repository snapshot; the third has to be re-checked
 * against the repository's real HEAD every time the graph is opened, which is
 * what makes staleness detectable at all.
 */
import AgentServerGitService from "#/api/git-service/agent-server-git-service.api";
import { getGitPath } from "#/utils/get-git-path";
import type { RepositorySnapshot } from "#/lib/knowledge/knowledge-engine";

/**
 * A Neo workspace *is* the checkout directory the agent-server provisioned
 * — that is what `RepositorySnapshot.localPath` holds, and what every other
 * workspace-scoped call in this app (`RemoteWorkspace`, `getGitPath`) keys on.
 * Using it directly avoids inventing a parallel workspace identifier that
 * nothing else in the app would recognise.
 */
export function workspaceIdForSnapshot(snapshot: RepositorySnapshot): string {
  return snapshot.localPath;
}

/**
 * Resolves the repository's current HEAD. Returns `null` rather than throwing:
 * a graph whose freshness we could not verify is reported as "unknown", which
 * is honest, where a thrown error would block viewing a graph that may well be
 * current.
 */
export async function resolveHeadCommitSha(
  snapshot: RepositorySnapshot,
  conversationUrl: string | null,
  sessionApiKey: string | null,
): Promise<string | null> {
  try {
    const gitPath = getGitPath(
      `${snapshot.owner}/${snapshot.repo}`,
      snapshot.localPath,
    );
    const page = await AgentServerGitService.getGitCommits(
      conversationUrl,
      sessionApiKey,
      gitPath,
    );
    return page?.commits[0]?.sha ?? null;
  } catch {
    return null;
  }
}
