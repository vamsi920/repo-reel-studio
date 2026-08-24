import { useEffect } from "react";

import { usageRepository, type UsageEventRow } from "#/lib/data-platform";
import useRealUsageStore from "#/stores/real-usage-store";

/**
 * The "real time" half of the Supabase leg: any session with this workspace
 * open -- including another browser tab -- shows up here live, via
 * Postgres's own replication stream rather than polling. A no-op when
 * Supabase is unconfigured (`usageRepository.subscribe` returns a no-op
 * unsubscribe in that case) or when there is no resolved workspace.
 *
 * Upserts by id into the same local store `useTrackRealUsage` writes to, so
 * this tab's own writes and their Realtime echo collapse into one entry
 * instead of doubling the count.
 *
 * Takes an explicit `workspaceId` rather than resolving one internally --
 * this is mounted from both a live conversation (`useWorkspaceId()`) and the
 * Usage route, which has no active conversation and resolves its own
 * workspace from the page's selector instead.
 */
export function useRealUsageRealtime(workspaceId: string | null): void {
  useEffect(() => {
    if (!workspaceId) return undefined;

    return usageRepository.subscribe(workspaceId, (row: UsageEventRow) => {
      const tokens = (row.tokens ?? {}) as {
        promptTokens?: number;
        completionTokens?: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
        model?: string | null;
      };
      useRealUsageStore.getState().recordUsageEvent({
        id: row.id,
        workspaceId: row.workspaceId,
        conversationId: row.runId ?? null,
        at: row.occurredAt,
        costUsd: row.costUsd ?? null,
        usage: {
          promptTokens: tokens.promptTokens ?? 0,
          completionTokens: tokens.completionTokens ?? 0,
          cacheReadTokens: tokens.cacheReadTokens ?? 0,
          cacheWriteTokens: tokens.cacheWriteTokens ?? 0,
        },
        model: tokens.model ?? null,
      });
    });
  }, [workspaceId]);
}
