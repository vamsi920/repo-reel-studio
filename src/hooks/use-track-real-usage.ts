import { useEffect } from "react";

import { trackRealUsage } from "#/lib/real-usage/track-usage";
import useMetricsStore from "#/stores/metrics-store";

import { useOptionalConversationId } from "./use-conversation-id";
import { useSettings } from "./query/use-settings";
import { useWorkspaceId } from "./use-workspace-id";

/**
 * The other half of `useMemoryObserver`/`useMemoryUpdater`: where those only
 * ever capture a narrow whitelist of successful build/test commands, this
 * captures genuine spend on every turn, unconditionally. Mounted once in the
 * conversation route; every `metrics-store` change (the same live data the
 * per-conversation Usage panel already renders) runs through
 * `trackRealUsage`, which diffs and records only the real increment.
 */
export function useTrackRealUsage(): void {
  const workspaceId = useWorkspaceId();
  const { conversationId } = useOptionalConversationId();
  const cost = useMetricsStore((state) => state.cost);
  const usage = useMetricsStore((state) => state.usage);
  const { data: settings } = useSettings();

  useEffect(() => {
    trackRealUsage({
      workspaceId,
      conversationId: conversationId ?? null,
      cost,
      usage: usage
        ? {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            cacheReadTokens: usage.cache_read_tokens,
            cacheWriteTokens: usage.cache_write_tokens,
          }
        : null,
      model: settings?.llm_model ?? null,
    });
  }, [workspaceId, conversationId, cost, usage, settings?.llm_model]);
}
