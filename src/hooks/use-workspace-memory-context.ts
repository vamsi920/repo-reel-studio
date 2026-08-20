import { useCallback } from "react";

import useMetricsStore from "#/stores/metrics-store";
import useWorkspaceMemoryStore from "#/stores/workspace-memory-store";
import { WorkspaceContextService } from "#/lib/workspace-memory";
import { useKnowledgeStore } from "#/stores/knowledge-store";

import { useActiveConversation } from "./query/use-active-conversation";
import { useSettings } from "./query/use-settings";
import { useWorkspaceId } from "./use-workspace-id";

/**
 * Memory should cost a slice of the context window, not a fixed number that is
 * absurd on a 32k model and negligible on a 1M one.
 */
const BUDGET_FRACTION = 0.04;
const MIN_BUDGET_TOKENS = 500;
const MAX_BUDGET_TOKENS = 4000;

export function resolveTokenBudget(contextWindow: number | undefined): number {
  if (!contextWindow || contextWindow <= 0) return MIN_BUDGET_TOKENS;
  return Math.min(
    MAX_BUDGET_TOKENS,
    Math.max(MIN_BUDGET_TOKENS, Math.floor(contextWindow * BUDGET_FRACTION)),
  );
}

/**
 * Builds the workspace-memory block for an outgoing message and records what
 * it cost. Returns an empty string whenever memory cannot apply -- no
 * workspace, nothing relevant, or the feature switched off -- so callers can
 * treat it as "prepend this, or don't".
 */
export function useWorkspaceMemoryContext() {
  const workspaceId = useWorkspaceId();
  const { data: conversation } = useActiveConversation();
  const contextWindow = useMetricsStore((state) => state.usage?.context_window);
  const { data: settings } = useSettings();
  const knowledgeByRepository = useKnowledgeStore(
    (state) => state.byRepositoryId,
  );
  const recordSavings = useWorkspaceMemoryStore((state) => state.recordSavings);

  return useCallback(
    (task: string): string => {
      if (!workspaceId || !task.trim()) return "";

      const repositoryId = conversation?.selected_repository ?? undefined;
      // The commit is what makes repository-derived context go stale, so it is
      // preferred over the branch name. Only the knowledge engine resolves a
      // real SHA; without one we fall back to the branch, which invalidates
      // less often -- a shorter cache life, not a wrong one.
      const commitSha =
        (repositoryId
          ? knowledgeByRepository[repositoryId]?.snapshot.commitSha
          : null) ??
        conversation?.selected_branch ??
        null;

      const context = WorkspaceContextService.buildContext({
        workspaceId,
        task,
        conversationId: conversation?.id ?? null,
        tokenBudget: resolveTokenBudget(contextWindow),
        // `selected_repository` is the repo this conversation was launched
        // against; memory recorded elsewhere in the workspace still applies,
        // it just ranks lower.
        repositoryId,
        commitSha,
        model: settings?.llm_model ?? null,
      });

      if (!context.text) return "";

      recordSavings(context.sample);
      return context.text;
    },
    [
      workspaceId,
      conversation,
      contextWindow,
      settings?.llm_model,
      knowledgeByRepository,
      recordSavings,
    ],
  );
}
