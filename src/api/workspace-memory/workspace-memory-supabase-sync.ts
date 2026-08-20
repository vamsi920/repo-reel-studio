/**
 * Third leg of the workspace-memory dual-write pattern: localStorage (fast
 * local cache, source of truth for synchronous reads,
 * `workspace-memory-store.api.ts`) and the in-sandbox file mirror (durable
 * copy for agent tooling, `workspace-memory-file.api.ts`) are unchanged and
 * both stay. This module adds a durable, cross-device sink in Supabase,
 * fired best-effort from `writeRecords` -- never awaited, never able to
 * block or fail a caller, and a no-op when Supabase isn't configured
 * (`isSupabaseConfigured`, see `#/lib/data-platform/client`).
 */
import { memoryRepository } from "#/lib/data-platform/repositories/memory-repository";
import type { MemoryRecord } from "#/lib/workspace-memory/types";

export function queueSupabaseMemorySync(
  workspaceId: string,
  records: readonly MemoryRecord[],
): void {
  if (!workspaceId || records.length === 0) return;
  void memoryRepository.upsertRecords(workspaceId, records).catch(() => {
    // Best-effort: a failed sync leaves localStorage and the file mirror
    // untouched and correct. There is no retry queue here (unlike the file
    // mirror's) because the next `writeRecords` call for this workspace will
    // naturally re-upsert the current state.
  });
}
