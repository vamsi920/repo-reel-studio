import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";

function logFailure(step: string, error: unknown): void {
  // A failed lookup used to be indistinguishable from "no snapshot yet":
  // the cold-load check in kt-graph.tsx would then show "Build code graph"
  // for a repository that does have a stored graph, with nothing in the
  // console to attribute it to. Mirrors repository-identity.ts's helper.
  console.error(`[codegraph-persistence] ${step} failed`, error);
}

/**
 * Metadata-only persistence for CodeGraph, against `codegraph_snapshots`
 * (supabase/migrations/20260819201308_knowledge_codegraph.sql). The real
 * node/edge payload deliberately stays in the existing sharded workspace-file
 * format at `.neodevex/codegraph/out/<commitSha>/{meta.json,levels/*.json,
 * search.json}` -- this table only records that a graph exists for a given
 * commit, so the UI can skip straight to `openExistingAnalysis` instead of
 * showing "no graph has been built yet" every time the page reloads.
 */
export interface CodegraphSnapshotInput {
  workspaceId: string;
  repositoryUuid: string;
  commitSha: string;
  nodeCount: number;
  edgeCount: number;
  analyzerVersion: string;
  outputPath: string;
}

export interface CodegraphPersistenceRepository {
  saveSnapshot(input: CodegraphSnapshotInput): Promise<void>;
  hasSnapshot(
    workspaceId: string,
    repositoryUuid: string,
    commitSha: string,
  ): Promise<boolean>;
  /**
   * Looks up an existing snapshot's own stored `workspace_id` for a
   * repository + commit, without requiring the caller to already know (or
   * correctly re-derive) that workspace id. A cold page load has no real
   * local path, so it cannot reproduce the workspace id a previous, real
   * generation wrote the snapshot under -- this lets a cold rehydration ask
   * the snapshot table itself which workspace actually generated it, the
   * same way Knowledge docs look up content by repository id alone. Returns
   * the most recently generated match when more than one workspace has a
   * snapshot for the same commit.
   */
  findSnapshotWorkspaceId(
    repositoryUuid: string,
    commitSha: string,
  ): Promise<string | null>;
}

class SupabaseCodegraphPersistenceRepository implements CodegraphPersistenceRepository {
  async saveSnapshot(input: CodegraphSnapshotInput): Promise<void> {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      const { error } = await supabase.from("codegraph_snapshots").upsert(
        {
          workspace_id: input.workspaceId,
          repository_id: input.repositoryUuid,
          commit_sha: input.commitSha,
          node_count: input.nodeCount,
          edge_count: input.edgeCount,
          analyzer_version: input.analyzerVersion,
          output_path: input.outputPath,
        },
        { onConflict: "workspace_id,repository_id,commit_sha" },
      );
      if (error) logFailure("codegraph_snapshots upsert", error);
    } catch (error) {
      // Best-effort -- the graph itself already rendered from the real
      // on-disk analysis output; a failed persistence write only affects
      // whether the next visit has to click "Build code graph" again.
      logFailure("codegraph_snapshots upsert", error);
    }
  }

  async hasSnapshot(
    workspaceId: string,
    repositoryUuid: string,
    commitSha: string,
  ): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) return false;
    try {
      const { data, error } = await supabase
        .from("codegraph_snapshots")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("repository_id", repositoryUuid)
        .eq("commit_sha", commitSha)
        .maybeSingle();
      if (error) logFailure("codegraph_snapshots lookup", error);
      return Boolean(data);
    } catch (error) {
      logFailure("codegraph_snapshots lookup", error);
      return false;
    }
  }

  async findSnapshotWorkspaceId(
    repositoryUuid: string,
    commitSha: string,
  ): Promise<string | null> {
    if (!isSupabaseConfigured || !supabase) return null;
    try {
      const { data, error } = await supabase
        .from("codegraph_snapshots")
        .select("workspace_id")
        .eq("repository_id", repositoryUuid)
        .eq("commit_sha", commitSha)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) logFailure("codegraph_snapshots workspace lookup", error);
      return (data?.workspace_id as string | undefined) ?? null;
    } catch (error) {
      logFailure("codegraph_snapshots workspace lookup", error);
      return null;
    }
  }
}

export const codegraphPersistenceRepository: CodegraphPersistenceRepository =
  new SupabaseCodegraphPersistenceRepository();
