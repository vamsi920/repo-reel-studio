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
 * + the additive `branch`/`page_id`/`position` columns and update/delete RLS
 * policies from 20260923190000_knowledge_branch_rls_and_order.sql). Stores
 * the whole normalized
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

export interface ListGeneratedRepositoriesResult {
  summaries: PersistedRepositorySummary[];
  /** True when the Supabase lookup itself failed (auth/session error, RLS
   * denial, network failure) rather than genuinely returning zero rows --
   * callers must not render "nothing generated yet" copy when this is true,
   * since real generations may exist and just couldn't be read. */
  error: boolean;
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
    branch: string,
  ): Promise<KnowledgeRepository | null>;
  /** Every repository this user has at least one generation for, RLS-scoped
   * automatically to workspaces they belong to. Used to populate the /kt
   * list page with previously-generated repos that have no open
   * conversation right now. */
  listGeneratedRepositories(): Promise<ListGeneratedRepositoriesResult>;
}

interface GenerationRow {
  id: string;
  commit_sha: string;
  title: string | null;
  summary: string | null;
  generated_at: string;
}

// A genuine query error (RLS denial, network failure) used to be
// indistinguishable from "no generation exists yet" everywhere in this file
// -- every read discarded `error` and either fell through a bare `if
// (!data)` check or a silent `catch { return null }`, so Docs rendered "This
// repository hasn't been generated yet" for a repo that really does have
// generated knowledge, with zero console signal pointing at why. Only the
// expected "no row found" case (`maybeSingle` resolving `data: null` with no
// `error`) should stay silent; anything else must log.
function logFailure(step: string, error: unknown): void {
  console.error(`[knowledge-repository] ${step} failed`, error);
}

async function reconstruct(
  repositoryUuid: string,
  generation: GenerationRow,
): Promise<KnowledgeRepository | null> {
  if (!supabase) return null;

  const [
    { data: sectionRows, error: sectionsError },
    { data: pageRows, error: pagesError },
    { data: diagramRows, error: diagramsError },
  ] = await Promise.all([
    supabase
      .from("knowledge_sections")
      .select("id, title, description, page_ids")
      .eq("generation_id", generation.id)
      .order("position", { ascending: true }),
    supabase
      .from("knowledge_pages")
      .select(
        "id, title, description, content_markdown, importance, relevant_files, related_page_ids, parent_section_id",
      )
      .eq("generation_id", generation.id)
      .order("position", { ascending: true }),
    supabase
      .from("knowledge_diagrams")
      .select("id, page_id, type, mermaid")
      .eq("page_generation_id", generation.id),
  ]);
  if (sectionsError)
    logFailure("reconstruct: knowledge_sections", sectionsError);
  if (pagesError) logFailure("reconstruct: knowledge_pages", pagesError);
  if (diagramsError)
    logFailure("reconstruct: knowledge_diagrams", diagramsError);

  // Any of the three failing must fail the whole reconstruction, not just
  // the one that happened to be `pageRows`: a `sectionsError`/`diagramsError`
  // with `pageRows` still present used to fall through to `sectionRows ?? []`
  // / `diagramsByPage` staying empty, rendering a generation that genuinely
  // has content as one with an empty table of contents or missing diagrams --
  // indistinguishable downstream from "this generation really has none".
  if (!pageRows || sectionsError || diagramsError) return null;

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
          { onConflict: "repository_id,branch,commit_sha" },
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

      const sectionRows = knowledge.sections.map((section, index) => ({
        generation_id: generationId,
        id: section.id,
        title: section.title,
        description: section.description ?? null,
        page_ids: section.pageIds,
        position: index,
      }));
      const pageRows = knowledge.pages.map((page, index) => ({
        generation_id: generationId,
        id: page.id,
        title: page.title,
        description: page.description,
        content_markdown: page.contentMarkdown,
        importance: page.importance,
        relevant_files: page.relevantFiles,
        related_page_ids: page.relatedPageIds,
        parent_section_id: page.parentSectionId ?? null,
        position: index,
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
      const { data: generation, error } = await supabase
        .from("knowledge_generations")
        .select("id, commit_sha, title, summary, generated_at")
        .eq("repository_id", repositoryUuid)
        .eq("commit_sha", commitSha)
        .maybeSingle();
      if (error) logFailure("getFullGeneration", error);
      if (!generation) return null;
      return await reconstruct(repositoryUuid, generation as GenerationRow);
    } catch (error) {
      logFailure("getFullGeneration", error);
      return null;
    }
  }

  async getLatestGenerationForRepository(
    repositoryUuid: string,
    branch: string,
  ): Promise<KnowledgeRepository | null> {
    if (!isSupabaseConfigured || !supabase) return null;
    try {
      // `repositoryUuid` identifies the repo, not the branch -- a repo with
      // generations for more than one branch used to return whichever
      // branch was generated most recently across the whole repo, so
      // reloading `/kt/<owner>/<repo>@<branch>` could silently render a
      // different branch's title/sections/pages/commit sha under this
      // branch's URL and label. Filtering by `branch` here keeps this scoped
      // to the branch the caller actually asked for.
      const { data: generation, error } = await supabase
        .from("knowledge_generations")
        .select("id, commit_sha, title, summary, generated_at")
        .eq("repository_id", repositoryUuid)
        .eq("branch", branch)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) logFailure("getLatestGenerationForRepository", error);
      if (!generation) return null;
      return await reconstruct(repositoryUuid, generation as GenerationRow);
    } catch (error) {
      logFailure("getLatestGenerationForRepository", error);
      return null;
    }
  }

  async listGeneratedRepositories(): Promise<ListGeneratedRepositoriesResult> {
    if (!isSupabaseConfigured || !supabase)
      return { summaries: [], error: false };
    try {
      const { data: generations, error: generationsError } = await supabase
        .from("knowledge_generations")
        .select("repository_id, branch")
        .order("generated_at", { ascending: false });
      if (generationsError) {
        logFailure(
          "listGeneratedRepositories: knowledge_generations",
          generationsError,
        );
        return { summaries: [], error: true };
      }
      if (!generations || generations.length === 0) {
        return { summaries: [], error: false };
      }

      // `generations` can hold several branches per repo. Deduping down to
      // one row per `repository_id` (keeping only whichever branch was
      // generated most recently repo-wide) used to make a repo with, say,
      // both `main` and `release` generated show only one of them here --
      // the /kt list page then offered "Generate Knowledge" for the other
      // branch even though Supabase already had real content for it,
      // letting the user kick off a redundant DeepWiki run. Dedupe by
      // (repository_id, branch) instead so every generated branch surfaces;
      // `generations` is already ordered by `generated_at` descending, so
      // the first row seen per pair is that pair's latest generation.
      const seenPairs = new Set<string>();
      const repoBranchPairs: { repositoryId: string; branch: string | null }[] =
        [];
      for (const row of generations) {
        const repositoryId = row.repository_id as string;
        const branch = (row.branch as string | null) ?? null;
        const pairKey = `${repositoryId}\0${branch ?? ""}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        repoBranchPairs.push({ repositoryId, branch });
      }

      const repositoryIds = Array.from(
        new Set(repoBranchPairs.map((pair) => pair.repositoryId)),
      );
      const { data: repos, error: reposError } = await supabase
        .from("repositories")
        .select("id, owner, name")
        .in("id", repositoryIds);
      if (reposError) {
        logFailure("listGeneratedRepositories: repositories", reposError);
        return { summaries: [], error: true };
      }
      if (!repos) return { summaries: [], error: false };

      const repoById = new Map(repos.map((row) => [row.id as string, row]));
      const summaries: PersistedRepositorySummary[] = [];
      for (const pair of repoBranchPairs) {
        const repo = repoById.get(pair.repositoryId);
        if (!repo) continue;
        summaries.push({
          owner: repo.owner as string,
          repo: repo.name as string,
          branch: pair.branch,
        });
      }

      return { summaries, error: false };
    } catch (error) {
      logFailure("listGeneratedRepositories", error);
      return { summaries: [], error: true };
    }
  }
}

export const knowledgePersistenceRepository: KnowledgePersistenceRepository =
  new SupabaseKnowledgePersistenceRepository();
