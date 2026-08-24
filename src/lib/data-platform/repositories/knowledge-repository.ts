import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";
import type {
  KnowledgeRepository,
  KnowledgeSection,
  KnowledgePage,
  KnowledgeDiagram,
  RelevantFile,
} from "#/lib/knowledge/knowledge-engine";

/**
 * Full-content persistence for Knowledge (Docs), against
 * `knowledge_generations`/`knowledge_sections`/`knowledge_pages`/
 * `knowledge_diagrams` (supabase/migrations/20260819201308_knowledge_codegraph.sql
 * + the additive `page_id`/`branch` columns). Stores the whole normalized
 * `KnowledgeRepository`, not just an existence marker -- DeepWiki's own cache
 * lives in a separate process that can be down, and Postgres is only ever
 * written right after a real generation completes, so duplicated-content
 * drift isn't a real risk.
 */
export interface PersistedRepositorySummary {
  owner: string;
  repo: string;
  branch: string | null;
}

export interface KnowledgePersistenceRepository {
  saveFullKnowledge(
    repositoryUuid: string,
    workspaceId: string,
    branch: string,
    knowledge: KnowledgeRepository,
  ): Promise<void>;
  getFullGeneration(
    repositoryUuid: string,
    commitSha: string,
  ): Promise<KnowledgeRepository | null>;
  getLatestGenerationForRepository(
    repositoryUuid: string,
  ): Promise<KnowledgeRepository | null>;
  /** Every repository this user has at least one generation for, RLS-scoped
   * automatically to workspaces they belong to. Used to populate the /kt
   * list page with previously-generated repos that have no open
   * conversation right now. */
  listGeneratedRepositories(): Promise<PersistedRepositorySummary[]>;
}

interface GenerationRow {
  id: string;
  commit_sha: string;
  title: string | null;
  summary: string | null;
  generated_at: string;
}

async function reconstruct(
  repositoryUuid: string,
  generation: GenerationRow,
): Promise<KnowledgeRepository | null> {
  if (!supabase) return null;

  const [{ data: sectionRows }, { data: pageRows }, { data: diagramRows }] =
    await Promise.all([
      supabase
        .from("knowledge_sections")
        .select("id, title, description, page_ids")
        .eq("generation_id", generation.id),
      supabase
        .from("knowledge_pages")
        .select(
          "id, title, description, content_markdown, importance, relevant_files, related_page_ids, parent_section_id",
        )
        .eq("generation_id", generation.id),
      supabase
        .from("knowledge_diagrams")
        .select("id, page_id, type, mermaid")
        .eq("page_generation_id", generation.id),
    ]);

  if (!pageRows) return null;

  const diagramsByPage = new Map<string, KnowledgeDiagram[]>();
  for (const row of diagramRows ?? []) {
    if (!row.page_id) continue;
    const list = diagramsByPage.get(row.page_id) ?? [];
    list.push({
      id: row.id,
      type: row.type as KnowledgeDiagram["type"],
      mermaid: row.mermaid ?? "",
    });
    diagramsByPage.set(row.page_id, list);
  }

  const pages: KnowledgePage[] = pageRows.map((row) => ({
    id: row.id,
    title: row.title ?? "",
    description: row.description ?? "",
    contentMarkdown: row.content_markdown ?? "",
    importance: (row.importance ?? "medium") as KnowledgePage["importance"],
    relevantFiles: (row.relevant_files ?? []) as RelevantFile[],
    diagrams: diagramsByPage.get(row.id) ?? [],
    relatedPageIds: row.related_page_ids ?? [],
    parentSectionId: row.parent_section_id ?? undefined,
  }));

  const sections: KnowledgeSection[] = (sectionRows ?? []).map((row) => ({
    id: row.id,
    title: row.title ?? "",
    description: row.description ?? undefined,
    pageIds: row.page_ids ?? [],
  }));

  return {
    repositoryId: repositoryUuid,
    commitSha: generation.commit_sha,
    title: generation.title ?? "",
    summary: generation.summary ?? "",
    sections,
    pages,
    generatedAt: generation.generated_at,
  };
}

class SupabaseKnowledgePersistenceRepository implements KnowledgePersistenceRepository {
  async saveFullKnowledge(
    repositoryUuid: string,
    workspaceId: string,
    branch: string,
    knowledge: KnowledgeRepository,
  ): Promise<void> {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      const { data: generation, error: generationError } = await supabase
        .from("knowledge_generations")
        .upsert(
          {
            repository_id: repositoryUuid,
            workspace_id: workspaceId,
            commit_sha: knowledge.commitSha,
            title: knowledge.title,
            summary: knowledge.summary,
            branch,
            generated_at: knowledge.generatedAt,
          },
          { onConflict: "repository_id,commit_sha" },
        )
        .select("id")
        .single();
      if (generationError || !generation) return;
      const generationId = generation.id as string;

      await Promise.all([
        supabase
          .from("knowledge_sections")
          .delete()
          .eq("generation_id", generationId),
        supabase
          .from("knowledge_pages")
          .delete()
          .eq("generation_id", generationId),
        supabase
          .from("knowledge_diagrams")
          .delete()
          .eq("page_generation_id", generationId),
      ]);

      const sectionRows = knowledge.sections.map((section) => ({
        generation_id: generationId,
        id: section.id,
        title: section.title,
        description: section.description ?? null,
        page_ids: section.pageIds,
      }));
      const pageRows = knowledge.pages.map((page) => ({
        generation_id: generationId,
        id: page.id,
        title: page.title,
        description: page.description,
        content_markdown: page.contentMarkdown,
        importance: page.importance,
        relevant_files: page.relevantFiles,
        related_page_ids: page.relatedPageIds,
        parent_section_id: page.parentSectionId ?? null,
      }));
      const diagramRows = knowledge.pages.flatMap((page) =>
        page.diagrams.map((diagram) => ({
          page_generation_id: generationId,
          page_id: page.id,
          id: diagram.id,
          type: diagram.type,
          mermaid: diagram.mermaid,
        })),
      );

      await Promise.all([
        sectionRows.length
          ? supabase.from("knowledge_sections").insert(sectionRows)
          : Promise.resolve(),
        pageRows.length
          ? supabase.from("knowledge_pages").insert(pageRows)
          : Promise.resolve(),
        diagramRows.length
          ? supabase.from("knowledge_diagrams").insert(diagramRows)
          : Promise.resolve(),
      ]);
    } catch {
      // Best-effort -- Docs already rendered from the in-memory store; a
      // failed persistence write only affects cold rehydration later.
    }
  }

  async getFullGeneration(
    repositoryUuid: string,
    commitSha: string,
  ): Promise<KnowledgeRepository | null> {
    if (!isSupabaseConfigured || !supabase) return null;
    try {
      const { data: generation } = await supabase
        .from("knowledge_generations")
        .select("id, commit_sha, title, summary, generated_at")
        .eq("repository_id", repositoryUuid)
        .eq("commit_sha", commitSha)
        .maybeSingle();
      if (!generation) return null;
      return await reconstruct(repositoryUuid, generation as GenerationRow);
    } catch {
      return null;
    }
  }

  async getLatestGenerationForRepository(
    repositoryUuid: string,
  ): Promise<KnowledgeRepository | null> {
    if (!isSupabaseConfigured || !supabase) return null;
    try {
      const { data: generation } = await supabase
        .from("knowledge_generations")
        .select("id, commit_sha, title, summary, generated_at")
        .eq("repository_id", repositoryUuid)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!generation) return null;
      return await reconstruct(repositoryUuid, generation as GenerationRow);
    } catch {
      return null;
    }
  }

  async listGeneratedRepositories(): Promise<PersistedRepositorySummary[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    try {
      const { data: generations } = await supabase
        .from("knowledge_generations")
        .select("repository_id, branch")
        .order("generated_at", { ascending: false });
      if (!generations || generations.length === 0) return [];

      const repositoryIds = Array.from(
        new Set(generations.map((row) => row.repository_id as string)),
      );
      const branchByRepo = new Map<string, string | null>();
      for (const row of generations) {
        const id = row.repository_id as string;
        if (!branchByRepo.has(id)) branchByRepo.set(id, row.branch ?? null);
      }

      const { data: repos } = await supabase
        .from("repositories")
        .select("id, owner, name")
        .in("id", repositoryIds);
      if (!repos) return [];

      return repos.map((row) => ({
        owner: row.owner as string,
        repo: row.name as string,
        branch: branchByRepo.get(row.id as string) ?? null,
      }));
    } catch {
      return [];
    }
  }
}

export const knowledgePersistenceRepository: KnowledgePersistenceRepository =
  new SupabaseKnowledgePersistenceRepository();
