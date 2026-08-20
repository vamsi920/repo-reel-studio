/**
 * Queue between the synchronous store and the workspace file.
 *
 * Writes land in localStorage immediately and queue here; the queue drains
 * whenever a conversation runtime is alive. The queue itself is persisted, so
 * a reload before the runtime comes up does not lose the pending records.
 */
import type { MemoryRecord } from "#/lib/workspace-memory/types";

import {
  appendRecordsToWorkspace,
  type RuntimeContext,
} from "./workspace-memory-file.api";

const QUEUE_KEY = "neodevex_workspace_memory_mirror_v1";
const MAX_QUEUED_PER_WORKSPACE = 500;
const BATCH_SIZE = 25;

type QueueMap = Record<string, MemoryRecord[]>;

let inMemoryQueue: QueueMap | null = null;

function hasStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function loadQueue(): QueueMap {
  if (inMemoryQueue) return inMemoryQueue;
  if (!hasStorage()) return {};
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueueMap) : {};
  } catch {
    return {};
  }
}

function saveQueue(queue: QueueMap): void {
  if (inMemoryQueue || !hasStorage()) {
    inMemoryQueue = queue;
    return;
  }
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    inMemoryQueue = queue;
  }
}

export function enqueueMirror(workspaceId: string, record: MemoryRecord): void {
  if (!workspaceId) return;
  const queue = loadQueue();
  const pending = queue[workspaceId] ?? [];
  // Oldest-out: the file is a mirror, and losing the oldest pending record is
  // preferable to unbounded growth in a 5MB store.
  queue[workspaceId] = [...pending, record].slice(-MAX_QUEUED_PER_WORKSPACE);
  saveQueue(queue);
}

export function getPendingMirrorCount(workspaceId: string): number {
  if (!workspaceId) return 0;
  return loadQueue()[workspaceId]?.length ?? 0;
}

export interface FlushResult {
  flushed: number;
  remaining: number;
  error?: string;
}

/**
 * Drains up to one batch. Records stay queued on failure so a flaky runtime
 * costs a retry, not the data.
 */
export async function flushMirror(
  workspaceId: string,
  context: RuntimeContext,
): Promise<FlushResult> {
  if (!workspaceId) return { flushed: 0, remaining: 0 };
  const queue = loadQueue();
  const pending = queue[workspaceId] ?? [];
  if (pending.length === 0) return { flushed: 0, remaining: 0 };

  const batch = pending.slice(0, BATCH_SIZE);
  const result = await appendRecordsToWorkspace(context, batch);
  if (!result.ok) {
    return { flushed: 0, remaining: pending.length, error: result.error };
  }

  // Re-read: another flush or write may have touched the queue while the
  // command was in flight.
  const latest = loadQueue();
  const remaining = (latest[workspaceId] ?? []).slice(batch.length);
  latest[workspaceId] = remaining;
  saveQueue(latest);

  return { flushed: batch.length, remaining: remaining.length };
}

/** Test-only. */
export function resetMirrorQueue(): void {
  inMemoryQueue = null;
  if (hasStorage()) {
    try {
      window.localStorage.removeItem(QUEUE_KEY);
    } catch {
      // Storage already unusable.
    }
  }
}
