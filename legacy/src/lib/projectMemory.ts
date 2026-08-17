// Per-project memory & context store.
//
// Every surface of the app (onboarding, ingestion, manifest generation,
// Repo Q&A, Agent Ops, SME reviews) records what it learned about a project
// here, and every AI step can pull a compact context block back out so the
// workflow gets smarter the longer a project lives.
//
// Storage is local-first: localStorage is the synchronous source of truth
// for the current tab (instant reads/writes, no API surface change), mirrored
// best-effort to Supabase's `project_memory_entries` table so memory survives
// a cleared cache or a different browser. Any Supabase failure is swallowed —
// this layer can never block or break a caller.

import { supabase } from "./supabaseClient";

export type ProjectMemoryKind =
  | "event" // something happened (ingested, manifest built, run launched)
  | "fact" // durable knowledge about the repo/product
  | "decision" // a choice the user or an agent made
  | "requirement" // product requirements (scratch projects start here)
  | "qa" // question asked + answer given in Repo Q&A
  | "sme"; // SME reviewer verdicts and findings

export interface ProjectMemoryEntry {
  id: string;
  project_id: string;
  kind: ProjectMemoryKind;
  content: string;
  /** Which surface wrote this: onboarding | ingestion | manifest | repo-qa | agent-ops | sme | user */
  source: string;
  /** Pinned entries survive pruning and lead the context block. */
  pinned: boolean;
  created_at: string;
}

export interface RecordMemoryInput {
  kind: ProjectMemoryKind;
  content: string;
  source: string;
  pinned?: boolean;
  /**
   * When provided, an existing entry with the same dedupe key is replaced
   * instead of appending a duplicate (e.g. re-running ingestion).
   */
  dedupeKey?: string;
}

const LS_KEY = "reel_studio_project_memory";
const MAX_ENTRIES_PER_PROJECT = 200;
const MAX_CONTENT_CHARS = 2000;

interface StoredEntry extends ProjectMemoryEntry {
  dedupe_key?: string;
}

type MemoryMap = Record<string, StoredEntry[]>;

function loadAll(): MemoryMap {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as MemoryMap) : {};
  } catch {
    return {};
  }
}

function saveAll(map: MemoryMap): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn("[projectMemory] localStorage write failed:", e);
  }
}

function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// Supabase mirror (best-effort, never blocks or throws for callers)
// ---------------------------------------------------------------------------

function syncRecordToSupabase(entry: StoredEntry): void {
  if (!supabase) return;
  void (async () => {
    try {
      if (entry.dedupe_key) {
        await supabase!
          .from("project_memory_entries")
          .delete()
          .eq("project_id", entry.project_id)
          .eq("dedupe_key", entry.dedupe_key);
      }
      await supabase!.from("project_memory_entries").insert({
        id: entry.id,
        project_id: entry.project_id,
        kind: entry.kind,
        content: entry.content,
        source: entry.source,
        pinned: entry.pinned,
        dedupe_key: entry.dedupe_key ?? null,
        created_at: entry.created_at,
      });
    } catch {
      // Best-effort mirror — localStorage remains the source of truth.
    }
  })();
}

function syncDeleteToSupabase(entryId: string): void {
  if (!supabase) return;
  void supabase.from("project_memory_entries").delete().eq("id", entryId);
}

function syncPinnedToSupabase(entryId: string, pinned: boolean): void {
  if (!supabase) return;
  void supabase.from("project_memory_entries").update({ pinned }).eq("id", entryId);
}

function syncClearToSupabase(projectId: string): void {
  if (!supabase) return;
  void supabase.from("project_memory_entries").delete().eq("project_id", projectId);
}

const hydratedProjects = new Set<string>();

/** Best-effort pull of any entries recorded elsewhere (another browser/device)
 * into the local cache. Runs at most once per project per page session. */
function hydrateFromSupabase(projectId: string): void {
  if (!supabase || !projectId || hydratedProjects.has(projectId)) return;
  hydratedProjects.add(projectId);
  void (async () => {
    try {
      const { data, error } = await supabase!
        .from("project_memory_entries")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });
      if (error || !data || data.length === 0) return;

      const map = loadAll();
      const existingIds = new Set((map[projectId] || []).map((e) => e.id));
      const remoteEntries: StoredEntry[] = data
        .filter((row) => !existingIds.has(row.id))
        .map((row) => ({
          id: row.id,
          project_id: row.project_id,
          kind: row.kind,
          content: row.content,
          source: row.source,
          pinned: row.pinned,
          created_at: row.created_at,
          dedupe_key: row.dedupe_key ?? undefined,
        }));
      if (remoteEntries.length === 0) return;

      map[projectId] = [...(map[projectId] || []), ...remoteEntries];
      saveAll(map);
      notify(projectId);
    } catch {
      // Best-effort hydration only.
    }
  })();
}

type Listener = (entries: ProjectMemoryEntry[]) => void;
const listeners = new Map<string, Set<Listener>>();

function notify(projectId: string) {
  const subs = listeners.get(projectId);
  if (!subs || subs.size === 0) return;
  const entries = getProjectMemory(projectId);
  subs.forEach((cb) => {
    try {
      cb(entries);
    } catch {
      // Listener errors must not break writers.
    }
  });
}

/** Subscribe to memory changes for a project. Returns an unsubscribe fn. */
export function subscribeProjectMemory(
  projectId: string,
  cb: Listener
): () => void {
  if (!listeners.has(projectId)) listeners.set(projectId, new Set());
  listeners.get(projectId)!.add(cb);
  hydrateFromSupabase(projectId);
  return () => {
    listeners.get(projectId)?.delete(cb);
  };
}

export function recordProjectMemory(
  projectId: string,
  input: RecordMemoryInput
): ProjectMemoryEntry | null {
  if (!projectId || !input.content?.trim()) return null;

  const entry: StoredEntry = {
    id: uid(),
    project_id: projectId,
    kind: input.kind,
    content: input.content.trim().slice(0, MAX_CONTENT_CHARS),
    source: input.source,
    pinned: Boolean(input.pinned),
    created_at: new Date().toISOString(),
    dedupe_key: input.dedupeKey,
  };

  const map = loadAll();
  let entries = map[projectId] || [];

  if (input.dedupeKey) {
    entries = entries.filter((e) => e.dedupe_key !== input.dedupeKey);
  }
  entries.push(entry);

  // Prune oldest unpinned entries beyond the cap.
  if (entries.length > MAX_ENTRIES_PER_PROJECT) {
    const overflow = entries.length - MAX_ENTRIES_PER_PROJECT;
    let removed = 0;
    entries = entries.filter((e) => {
      if (removed >= overflow || e.pinned) return true;
      removed += 1;
      return false;
    });
  }

  map[projectId] = entries;
  saveAll(map);
  syncRecordToSupabase(entry);
  notify(projectId);
  return entry;
}

export function getProjectMemory(projectId: string): ProjectMemoryEntry[] {
  if (!projectId) return [];
  hydrateFromSupabase(projectId);
  const entries = loadAll()[projectId] || [];
  return [...entries].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function deleteProjectMemoryEntry(
  projectId: string,
  entryId: string
): void {
  const map = loadAll();
  const entries = map[projectId];
  if (!entries) return;
  map[projectId] = entries.filter((e) => e.id !== entryId);
  saveAll(map);
  syncDeleteToSupabase(entryId);
  notify(projectId);
}

/** Promote or demote an entry in the prompt context without rewriting it. */
export function setProjectMemoryEntryPinned(
  projectId: string,
  entryId: string,
  pinned: boolean
): void {
  const map = loadAll();
  const entries = map[projectId];
  if (!entries) return;
  const entry = entries.find((candidate) => candidate.id === entryId);
  if (!entry || entry.pinned === pinned) return;
  entry.pinned = pinned;
  saveAll(map);
  syncPinnedToSupabase(entryId, pinned);
  notify(projectId);
}

export function clearProjectMemory(projectId: string): void {
  const map = loadAll();
  if (!(projectId in map)) return;
  delete map[projectId];
  saveAll(map);
  syncClearToSupabase(projectId);
  notify(projectId);
}

const KIND_PRIORITY: Record<ProjectMemoryKind, number> = {
  requirement: 0,
  decision: 1,
  fact: 2,
  sme: 3,
  qa: 4,
  event: 5,
};

const KIND_LABEL: Record<ProjectMemoryKind, string> = {
  requirement: "Requirement",
  decision: "Decision",
  fact: "Fact",
  sme: "SME finding",
  qa: "Q&A",
  event: "Event",
};

/**
 * Build a compact, prompt-ready context block from a project's memory.
 * Pinned entries and requirements/decisions come first; within a kind,
 * newest entries win. Returns "" when the project has no memory yet.
 */
export function buildMemoryContextBlock(
  projectId: string,
  opts: { maxChars?: number } = {}
): string {
  const maxChars = opts.maxChars ?? 4000;
  const entries = getProjectMemory(projectId);
  if (entries.length === 0) return "";

  const ranked = [...entries].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const kindDiff = KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind];
    if (kindDiff !== 0) return kindDiff;
    return b.created_at.localeCompare(a.created_at); // newest first
  });

  const header = "PROJECT MEMORY (accumulated context for this project):\n";
  const lines: string[] = [];
  let used = header.length;

  for (const entry of ranked) {
    const line = `- [${KIND_LABEL[entry.kind]}] ${entry.content}`;
    if (used + line.length + 1 > maxChars) break;
    lines.push(line);
    used += line.length + 1;
  }

  if (lines.length === 0) return "";
  return header + lines.join("\n");
}

/** Convenience: record a one-line event with dedupe on (source, label). */
export function recordProjectEvent(
  projectId: string,
  source: string,
  label: string,
  content: string
): void {
  recordProjectMemory(projectId, {
    kind: "event",
    content,
    source,
    dedupeKey: `${source}:${label}`,
  });
}
