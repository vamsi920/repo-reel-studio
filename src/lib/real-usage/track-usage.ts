/**
 * Turns a raw metrics snapshot into a recorded usage event: diffs it against
 * what was last seen for this conversation, and if there's a genuine
 * increment, writes it to the local store (instant, always available) and
 * fire-and-forgets it to Supabase (durable, cross-tab).
 *
 * Framework-agnostic on purpose -- the caller (a hook subscribed to
 * `metrics-store`) supplies the identity (workspace, conversation, model);
 * this module only knows how to diff and where to put the result.
 */
import { usageRepository } from "#/lib/data-platform";
import useRealUsageStore from "#/stores/real-usage-store";

import { diffCost, diffUsageSnapshot } from "./diff-usage";
import type { LlmUsageSnapshot, RealUsageEvent } from "./types";

interface LastSeen {
  usage: LlmUsageSnapshot;
  cost: number | null;
}

/**
 * Keyed by conversationId, not workspaceId: usage is cumulative per
 * conversation (metrics-store resets on conversation switch), so a new
 * conversation's first update must be diffed against nothing, not against
 * whatever a previous conversation happened to reach.
 */
const lastSeenByConversation = new Map<string, LastSeen>();

function newEventId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID)
    return crypto.randomUUID();
  return `usage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface TrackUsageInput {
  workspaceId: string | null;
  /** Null outside a conversation route -- nothing to track without one. */
  conversationId: string | null;
  cost: number | null;
  usage: LlmUsageSnapshot | null;
  model: string | null;
}

/**
 * Call on every `metrics-store` change. No-ops silently whenever there is
 * nothing to attribute the usage to (no workspace, no conversation, no
 * usage payload yet) or nothing new happened since the last call.
 */
export function trackRealUsage(input: TrackUsageInput): void {
  if (!input.workspaceId || !input.conversationId || !input.usage) return;

  const previous = lastSeenByConversation.get(input.conversationId);
  const usageDelta = diffUsageSnapshot(previous?.usage, input.usage);
  const costDelta = diffCost(previous?.cost, input.cost);

  lastSeenByConversation.set(input.conversationId, {
    usage: input.usage,
    cost: input.cost,
  });

  if (!usageDelta && costDelta === null) return;

  const event: RealUsageEvent = {
    id: newEventId(),
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    at: new Date().toISOString(),
    costUsd: costDelta,
    usage: usageDelta ?? {
      promptTokens: 0,
      completionTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    model: input.model,
  };

  useRealUsageStore.getState().recordUsageEvent(event);

  void usageRepository
    .recordEvent({
      workspaceId: event.workspaceId,
      source: "conversation",
      runId: event.conversationId ?? undefined,
      costUsd: event.costUsd ?? undefined,
      tokens: { ...event.usage, model: event.model },
    })
    .then((remoteId) => {
      if (remoteId) {
        useRealUsageStore
          .getState()
          .patchEventId(event.workspaceId, event.id, remoteId);
      }
    });
}

/** Test-only. */
export function resetUsageTracking(): void {
  lastSeenByConversation.clear();
}
