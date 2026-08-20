import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";

export interface MemorySimilarityMatch {
  recordId: string;
  statement: string;
  subject: string;
  kind: string;
  status: string;
  similarity: number;
}

/**
 * Tenant scoping happens INSIDE the `search_workspace_memory` RPC
 * (supabase/migrations/*_memory_vector_search_rpc.sql), never here --
 * callers can never run a global similarity query and filter by workspace
 * afterward, because there is no code path that queries `memory_embeddings`
 * directly.
 */
export interface VectorStore {
  searchWorkspaceMemory(
    workspaceId: string,
    queryEmbedding: number[],
    matchCount?: number,
  ): Promise<MemorySimilarityMatch[]>;
  upsertEmbedding(
    recordId: string,
    workspaceId: string,
    embedding: number[],
    model: string,
  ): Promise<void>;
}

class SupabaseVectorStore implements VectorStore {
  async searchWorkspaceMemory(
    workspaceId: string,
    queryEmbedding: number[],
    matchCount = 10,
  ): Promise<MemorySimilarityMatch[]> {
    if (!isSupabaseConfigured || !supabase || !workspaceId) return [];
    try {
      const { data, error } = await supabase.rpc("search_workspace_memory", {
        ws_id: workspaceId,
        query_embedding: queryEmbedding,
        match_count: matchCount,
      });
      if (error || !data) return [];
      return (data as Record<string, unknown>[]).map((row) => ({
        recordId: row.record_id as string,
        statement: row.statement as string,
        subject: row.subject as string,
        kind: row.kind as string,
        status: row.status as string,
        similarity: row.similarity as number,
      }));
    } catch {
      return [];
    }
  }

  async upsertEmbedding(
    recordId: string,
    workspaceId: string,
    embedding: number[],
    model: string,
  ): Promise<void> {
    // Populated by an Edge Function with the service-role key in the normal
    // path (see the plan's decision on where privileged work runs); this
    // method exists for local/dev/testing call sites that already hold a
    // configured client.
    if (!isSupabaseConfigured || !supabase) return;
    try {
      await supabase
        .from("memory_embeddings")
        .upsert(
          { record_id: recordId, workspace_id: workspaceId, embedding, model },
          { onConflict: "record_id" },
        );
    } catch {
      // Best-effort.
    }
  }
}

export const vectorStore: VectorStore = new SupabaseVectorStore();
