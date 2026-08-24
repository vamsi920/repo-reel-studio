/**
 * Genuine, additive usage -- what an agent actually spent, on every turn of
 * every conversation, independent of whether workspace memory ever had
 * anything to inject. This is deliberately a separate concept from
 * `SavingsSample` (`#/lib/workspace-memory`): that one only ever reports a
 * number when memory compression genuinely contributed, and stays that way.
 */

export interface LlmUsageSnapshot {
  promptTokens: number;
  completionTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface RealUsageEvent {
  /**
   * Client-generated on creation, patched to the Supabase row's real id once
   * the insert resolves (see `patchEventId` on the store). Local storage and
   * a same-tab Realtime echo both key off this id, so neither can double the
   * other -- an upsert-by-id, never a blind append.
   */
  id: string;
  workspaceId: string;
  conversationId: string | null;
  at: string;
  /** Null when the model has no published pricing -- never a guess. */
  costUsd: number | null;
  usage: LlmUsageSnapshot;
  model: string | null;
}
