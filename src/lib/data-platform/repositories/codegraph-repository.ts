import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";

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
}

class SupabaseCodegraphPersistenceRepository implements CodegraphPersistenceRepository {
  async saveSnapshot(input: CodegraphSnapshotInput): Promise<void> {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      await supabase.from("codegraph_snapshots").upsert(
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
    } catch {
      // Best-effort -- the graph itself already rendered from the real
      // on-disk analysis output; a failed persistence write only affects
      // whether the next visit has to click "Build code graph" again.
    }
  }

  async hasSnapshot(
    workspaceId: string,
    repositoryUuid: string,
    commitSha: string,
  ): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) return false;
    try {
      const { data } = await supabase
        .from("codegraph_snapshots")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("repository_id", repositoryUuid)
        .eq("commit_sha", commitSha)
        .maybeSingle();
      return Boolean(data);
    } catch {
      return false;
    }
  }
}

export const codegraphPersistenceRepository: CodegraphPersistenceRepository =
  new SupabaseCodegraphPersistenceRepository();
