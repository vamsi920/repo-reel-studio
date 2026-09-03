import { useMemo } from "react";
import { usePaginatedConversations } from "#/hooks/query/use-paginated-conversations";
import AgentServerGitService from "#/api/git-service/agent-server-git-service.api";
import { getGitPath } from "#/utils/get-git-path";

export interface RepoCandidate {
  repositoryId: string;
  owner: string;
  repo: string;
  branch: string;
  conversationUrl: string | null;
  sessionApiKey: string | null;
  workingDir: string | null;
  /** True for a repo sourced from Supabase with no live store entry and no
   * open conversation — RepoCard treats this the same as "ready" (real
   * knowledge exists, just not loaded into memory yet; opening it triggers
   * kt-repository.tsx's cold rehydration). */
  knownGenerated?: boolean;
}

/** One entry per distinct repository with a live conversation right now,
 * sourced from real conversation history — shared by kt-list.tsx (to list
 * repos) and kt-repository.tsx (to upgrade a cold/Supabase-only Docs entry
 * to a real live one with a usable session, whenever one is available). */
export function useConnectedRepositories(): RepoCandidate[] {
  const { data } = usePaginatedConversations(100);
  return useMemo(() => {
    const conversations = data?.pages.flatMap((page) => page.items) ?? [];
    const byRepo = new Map<string, RepoCandidate>();
    for (const conversation of conversations) {
      const repoSlug = conversation.selected_repository;
      if (!repoSlug) continue;
      const [owner, repo] = repoSlug.split("/");
      if (!owner || !repo) continue;
      const branch = conversation.selected_branch ?? "main";
      const repositoryId = `${repoSlug}@${branch}`;
      if (byRepo.has(repositoryId)) continue;
      byRepo.set(repositoryId, {
        repositoryId,
        owner,
        repo,
        branch,
        conversationUrl: conversation.conversation_url,
        sessionApiKey: conversation.session_api_key,
        workingDir: conversation.workspace?.working_dir?.trim() || null,
      });
    }
    return Array.from(byRepo.values());
  }, [data]);
}

const COMMIT_POLL_INTERVAL_MS = 2000;
// A real `git clone` for a GitHub-connected repo isn't a provisioning-layer
// step -- it's delegated to the agent's first conversational turn (a
// prepended "run: git clone ..." instruction), which only starts running
// after the agent loop spins up and the LLM decides to invoke its terminal
// tool. `waitForWorkspaceReady` resolves as soon as a working_dir PATH
// exists (often near-instantly for the local backend), well before that
// clone has had any time to run -- confirmed by direct reproduction: a real
// repo with real commits returned `{commits: [], has_more: false}` seconds
// after being added, and had real commits moments later once the clone
// actually finished. Poll instead of a single one-shot check.
const COMMIT_POLL_TIMEOUT_MS = 90_000;

export async function resolveCommitSha(
  owner: string,
  repo: string,
  workingDir: string,
  conversationUrl: string | null,
  sessionApiKey: string | null,
): Promise<string> {
  const gitPath = getGitPath(`${owner}/${repo}`, workingDir);
  const deadline = Date.now() + COMMIT_POLL_TIMEOUT_MS;

  for (;;) {
    const commitsPage = await AgentServerGitService.getGitCommits(
      conversationUrl,
      sessionApiKey,
      gitPath,
    );
    const commitSha = commitsPage?.commits[0]?.sha;
    if (commitSha) return commitSha;

    if (Date.now() >= deadline) {
      throw new Error(
        "Couldn't resolve a commit for this repository after waiting for the clone to finish — it may not have any commits yet, or the clone may have failed. Check the conversation for details.",
      );
    }
    await new Promise((resolve) =>
      setTimeout(resolve, COMMIT_POLL_INTERVAL_MS),
    );
  }
}
