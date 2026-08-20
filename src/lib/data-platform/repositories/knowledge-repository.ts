import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";

/**
 * Named `KnowledgePersistenceRepository`, not `KnowledgeRepository` --
 * `KnowledgeRepository` already exists in src/lib/knowledge/knowledge-engine.ts
 * as the normalized DeepWiki structure. This is the persistence concern only.
 */
export interface KnowledgeGenerationInput {
  repositoryId: string;
  workspaceId: string;
  commitSha: string;
  title?: string;
  summary?: string;
}

export interface KnowledgePersistenceRepository {
  saveGeneration(
    input: KnowledgeGenerationInput,
  ): Promise<{ id: string } | null>;
  getLatestGenerationId(
    repositoryId: string,
    commitSha: string,
  ): Promise<string | null>;
}

class SupabaseKnowledgePersistenceRepository implements KnowledgePersistenceRepository {
  async saveGeneration(
    input: KnowledgeGenerationInput,
  ): Promise<{ id: string } | null> {
    if (!isSupabaseConfigured || !supabase) return null;
    try {
      const { data, error } = await supabase
        .from("knowledge_generations")
        .upsert(
          {
            repository_id: input.repositoryId,
            workspace_id: input.workspaceId,
            commit_sha: input.commitSha,
            title: input.title ?? null,
            summary: input.summary ?? null,
          },
          { onConflict: "repository_id,commit_sha" },
        )
        .select("id")
        .single();
      if (error || !data) return null;
      return { id: data.id as string };
    } catch {
      return null;
    }
  }

  async getLatestGenerationId(
    repositoryId: string,
    commitSha: string,
  ): Promise<string | null> {
    if (!isSupabaseConfigured || !supabase || !repositoryId || !commitSha)
      return null;
    try {
      const { data, error } = await supabase
        .from("knowledge_generations")
        .select("id")
        .eq("repository_id", repositoryId)
        .eq("commit_sha", commitSha)
        .maybeSingle();
      if (error || !data) return null;
      return data.id as string;
    } catch {
      return null;
    }
  }
}

export const knowledgePersistenceRepository: KnowledgePersistenceRepository =
  new SupabaseKnowledgePersistenceRepository();
