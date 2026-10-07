import { useEffect, useRef } from "react";

import type { RepositorySnapshot } from "#/lib/knowledge/knowledge-engine";
import { findKnowledgeForConversation } from "#/lib/knowledge/kt-agent-context";
import {
  exportKtToWorkspace,
  readWorkspaceKtCommit,
} from "#/lib/knowledge/kt-workspace-export";
import { loadPersistedKnowledge } from "#/lib/knowledge/persisted-knowledge";
import { useKnowledgeStore } from "#/stores/knowledge-store";

import { useActiveConversation } from "./query/use-active-conversation";
import { useRuntimeIsReady } from "./use-runtime-is-ready";

/** A repo conversation clones during the agent's first turn; keep retrying
 * until the checkout exists (`exportKtToWorkspace` refuses before that). */
const RETRY_INTERVAL_MS = 30_000;

/**
 * Makes sure a repo conversation's folder holds the repo's KT docs under
 * `.neodevex/kt/`, wherever the conversation runs. KT generation writes them
 * only into the folder it generated in; this covers every other folder for
 * the same repo, and knowledge that only exists in Supabase.
 *
 * Writes only when the docs are missing or describe a different commit, at
 * most once per conversation per commit. Mounted once in the conversation
 * route; best-effort and silent.
 */
export function useKtWorkspaceSync(): void {
  const { data: conversation } = useActiveConversation();
  const runtimeIsReady = useRuntimeIsReady();
  const doneRef = useRef<string | null>(null);

  const conversationId = conversation?.id;
  const conversationUrl = conversation?.conversation_url;
  const sessionApiKey = conversation?.session_api_key;
  const workingDir = conversation?.workspace?.working_dir?.trim();
  const repository = conversation?.selected_repository?.trim();
  const branch = conversation?.selected_branch ?? null;

  useEffect(() => {
    if (!runtimeIsReady || !conversationUrl || !workingDir || !repository) {
      return undefined;
    }
    const [owner, repo] = repository.split("/");
    if (!owner || !repo) return undefined;

    let cancelled = false;
    const context = { conversationUrl, sessionApiKey, workingDir };

    const resolveKnowledge = async () => {
      const inStore = findKnowledgeForConversation({
        workingDir,
        repository,
        branch,
      });
      if (inStore || !branch) return inStore;
      const result = await loadPersistedKnowledge(owner, repo, branch);
      if (result.status !== "found") return null;
      const repositoryId = `${repository}@${branch}`;
      // Seed the store like cold rehydration does, so the chat's KT block
      // and per-message pointers see this knowledge too.
      if (!useKnowledgeStore.getState().byRepositoryId[repositoryId]) {
        useKnowledgeStore.getState().hydrate(
          repositoryId,
          {
            repositoryId,
            owner,
            repo,
            branch,
            commitSha: result.knowledge.commitSha,
            localPath: "",
          },
          result.knowledge,
          [],
        );
      }
      return result.knowledge;
    };

    const sync = async () => {
      try {
        const knowledge = await resolveKnowledge();
        if (cancelled || !knowledge) return;
        const doneKey = `${conversationId}::${knowledge.commitSha}`;
        if (doneRef.current === doneKey) return;

        const existing = await readWorkspaceKtCommit(context);
        if (cancelled) return;
        if (existing !== knowledge.commitSha) {
          const snapshot: RepositorySnapshot = {
            repositoryId: `${repository}@${branch ?? ""}`,
            owner,
            repo,
            branch: branch ?? "",
            commitSha: knowledge.commitSha,
            localPath: workingDir,
          };
          const result = await exportKtToWorkspace(
            context,
            knowledge,
            snapshot,
          );
          if (cancelled || !result.ok) return;
        }
        doneRef.current = doneKey;
        // Declared below; only reached after an await, once it is assigned.
        clearInterval(timer);
      } catch {
        // Best-effort: the next tick retries.
      }
    };

    const timer = setInterval(sync, RETRY_INTERVAL_MS);
    void sync();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [
    runtimeIsReady,
    conversationId,
    conversationUrl,
    sessionApiKey,
    workingDir,
    repository,
    branch,
  ]);
}
