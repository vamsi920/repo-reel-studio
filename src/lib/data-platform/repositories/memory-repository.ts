import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";
import type { MemoryRecord } from "#/lib/workspace-memory/types";

/**
 * Durable, cross-device backing store for workspace memory. This is a THIRD
 * leg alongside the existing two (localStorage -- fast local cache, source
 * of truth for synchronous reads; the in-sandbox file mirror -- durable copy
 * for agent tooling). See `workspace-memory-supabase-sync.ts` for how
 * `workspace-memory-store.api.ts` calls this without changing its own
 * synchronous contract.
 */
export interface MemoryRepository {
  upsertRecords(
    workspaceId: string,
    records: readonly MemoryRecord[],
  ): Promise<{ ok: boolean; error?: string }>;
  listRecords(workspaceId: string): Promise<MemoryRecord[]>;
}

interface MemoryRecordRow {
  id: string;
  workspace_id: string;
  kind: string;
  subject: string;
  statement: string;
  tags: string[];
  provenance: MemoryRecord["provenance"];
  status: MemoryRecord["status"];
  confidence: number | null;
  pinned: boolean;
  created_at: string;
  superseded_at: string | null;
  superseded_by_id: string | null;
  conflicts_with: string[];
  token_cost: number | null;
}

function toRow(record: MemoryRecord): MemoryRecordRow {
  return {
    id: record.id,
    workspace_id: record.workspaceId,
    kind: record.kind,
    subject: record.subject,
    statement: record.statement,
    tags: record.tags,
    provenance: record.provenance,
    status: record.status,
    confidence: record.confidence,
    pinned: record.pinned,
    created_at: record.createdAt,
    superseded_at: record.supersededAt,
    superseded_by_id: record.supersededById,
    conflicts_with: record.conflictsWith,
    token_cost: record.tokenCost,
  };
}

function fromRow(row: MemoryRecordRow): MemoryRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    kind: row.kind as MemoryRecord["kind"],
    subject: row.subject,
    statement: row.statement,
    tags: row.tags ?? [],
    provenance: row.provenance,
    status: row.status,
    confidence: row.confidence ?? 0,
    createdAt: row.created_at,
    supersededAt: row.superseded_at,
    supersededById: row.superseded_by_id,
    conflictsWith: row.conflicts_with ?? [],
    pinned: row.pinned,
    tokenCost: row.token_cost ?? 0,
  };
}

class SupabaseMemoryRepository implements MemoryRepository {
  async upsertRecords(
    workspaceId: string,
    records: readonly MemoryRecord[],
  ): Promise<{ ok: boolean; error?: string }> {
    if (!isSupabaseConfigured || !supabase || records.length === 0)
      return { ok: true };
    // Defensive, matching workspace-memory-store.api.ts's own ownership check:
    // a record can only ever be synced under its own workspace.
    const owned = records.filter(
      (record) => record.workspaceId === workspaceId,
    );
    if (owned.length === 0) return { ok: true };
    try {
      const { error } = await supabase
        .from("memory_records")
        .upsert(owned.map(toRow), { onConflict: "id" });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async listRecords(workspaceId: string): Promise<MemoryRecord[]> {
    if (!isSupabaseConfigured || !supabase || !workspaceId) return [];
    try {
      const { data, error } = await supabase
        .from("memory_records")
        .select("*")
        .eq("workspace_id", workspaceId);
      if (error || !data) return [];
      return (data as MemoryRecordRow[]).map(fromRow);
    } catch {
      return [];
    }
  }
}

export const memoryRepository: MemoryRepository =
  new SupabaseMemoryRepository();
