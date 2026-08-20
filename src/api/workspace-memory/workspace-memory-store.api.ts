/**
 * Synchronous read/write layer for workspace memory.
 *
 * The durable copy lives in the workspace on the agent-server
 * (`workspace-memory-file.api.ts`), but writing there needs a live conversation
 * runtime, which is not available when a page first loads or when the user is
 * between conversations. So localStorage is the source of truth for reads and
 * the file is a best-effort mirror. Same shape as the pre-fork
 * `legacy/src/lib/projectMemory.ts`.
 *
 * ISOLATION CONTRACT: every data-access export (read/write/clear/subscribe)
 * takes `workspaceId` as its first parameter. There is deliberately no
 * zero-argument variant, no "current workspace" default, and no
 * cross-workspace query -- a caller that does not know which workspace it is
 * in cannot read memory at all. This is enforced by `isolation.test.ts`.
 *
 * The one deliberate exception is `listKnownWorkspaceIds`, which returns
 * every workspace id with stored data and nothing else -- no record content,
 * no memory text. It exists solely for the Usage dashboard's "all workspaces"
 * rollup and workspace picker. It must never be imported by anything on the
 * retrieval/injection path (`workspace-context-service.ts`, `write-gate.ts`,
 * `memory-updater.ts`) -- `isolation.test.ts` greps for that too.
 */
import type { MemoryRecord } from "#/lib/workspace-memory/types";
import { queueSupabaseMemorySync } from "./workspace-memory-supabase-sync";

const STORAGE_KEY = "neodevex_workspace_memory_v1";
const MAX_RECORDS_PER_WORKSPACE = 300;

type MemoryMap = Record<string, MemoryRecord[]>;

/** Fallback when localStorage is unavailable or over quota. */
let inMemoryFallback: MemoryMap | null = null;

const subscribers = new Map<string, Set<() => void>>();

function hasStorage(): boolean {
  // Checked at call time, not module init: this is an SPA build (`ssr: false`)
  // but modules still evaluate in non-browser test and tooling contexts.
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function loadAll(): MemoryMap {
  if (inMemoryFallback) return inMemoryFallback;
  if (!hasStorage()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MemoryMap) : {};
  } catch {
    return {};
  }
}

function saveAll(map: MemoryMap): void {
  if (inMemoryFallback) {
    inMemoryFallback = map;
    return;
  }
  if (!hasStorage()) {
    inMemoryFallback = map;
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota exceeded or storage disabled. Degrade to in-memory rather than
    // throwing on a path that must never break the caller.
    inMemoryFallback = map;
  }
}

function notify(workspaceId: string): void {
  subscribers.get(workspaceId)?.forEach((callback) => callback());
}

/**
 * Keeps a workspace under the cap. Superseded records go first (they are
 * history, and the workspace file keeps the full trail), then the oldest
 * unpinned ones.
 */
export function pruneRecords(records: readonly MemoryRecord[]): MemoryRecord[] {
  if (records.length <= MAX_RECORDS_PER_WORKSPACE) return [...records];

  const ranked = [...records].sort((a, b) => {
    const rank = (record: MemoryRecord) => {
      if (record.pinned) return 3;
      if (record.status === "superseded") return 0;
      if (record.status === "conflicted") return 2;
      return 1;
    };
    const byRank = rank(b) - rank(a);
    if (byRank !== 0) return byRank;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });

  return ranked.slice(0, MAX_RECORDS_PER_WORKSPACE);
}

export function readRecords(workspaceId: string): MemoryRecord[] {
  if (!workspaceId) return [];
  return loadAll()[workspaceId] ?? [];
}

/**
 * Every workspace id that currently holds data, and nothing else -- see the
 * ISOLATION CONTRACT note above. Reporting-only: for the "all workspaces"
 * Usage rollup and workspace picker, never for building an agent's context.
 */
export function listKnownWorkspaceIds(): string[] {
  const map = loadAll();
  return Object.keys(map).filter((workspaceId) => map[workspaceId]?.length > 0);
}

export function writeRecords(
  workspaceId: string,
  records: readonly MemoryRecord[],
): void {
  if (!workspaceId) return;
  const map = loadAll();
  // Defensive: a record can only ever be stored under its own workspace.
  const owned = records.filter((record) => record.workspaceId === workspaceId);
  map[workspaceId] = pruneRecords(owned);
  saveAll(map);
  notify(workspaceId);
  // Fire-and-forget: never awaited, never blocks this synchronous function.
  queueSupabaseMemorySync(workspaceId, map[workspaceId]);
}

export function clearWorkspace(workspaceId: string): void {
  if (!workspaceId) return;
  const map = loadAll();
  delete map[workspaceId];
  saveAll(map);
  notify(workspaceId);
}

export function subscribeWorkspaceMemory(
  workspaceId: string,
  callback: () => void,
): () => void {
  const existing = subscribers.get(workspaceId) ?? new Set<() => void>();
  existing.add(callback);
  subscribers.set(workspaceId, existing);
  return () => {
    existing.delete(callback);
    if (existing.size === 0) subscribers.delete(workspaceId);
  };
}

/** Test-only: drops the in-memory fallback so cases start from a clean slate. */
export function resetWorkspaceMemoryStorage(): void {
  inMemoryFallback = null;
  if (hasStorage()) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to do: storage is already unusable.
    }
  }
}
