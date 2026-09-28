import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";

/**
 * Read-only from the browser: rows are written by the AgentOps sidecar
 * (scripts/agentops-server.mjs) using the service-role key, which bypasses
 * RLS. This repository exists for long-range/historical queries the
 * collector's in-memory JSONL index doesn't hold (it's bounded and
 * process-lifetime) -- e.g. "last quarter's spend by workspace." Live/
 * streaming data (runs in flight, approvals needing a decision) still goes
 * through `src/api/agentops-service/agentops-service.api.ts`, unchanged.
 */
export interface HistoricalAgentOpsRun {
  runId: string;
  workspaceId: string | null;
  agentName: string | null;
  status: string | null;
  costUsd: number;
  updatedAt: string;
}

export interface AgentOpsRepository {
  /**
   * `range.workspaceId`, if given, is the DB hash (`computeWorkspaceId()`
   * output) compared directly against the `agentops_runs.workspace_id`
   * column -- not the raw folder path -- mirroring the same documented
   * contract on the collector's own `listRuns` (scripts/agentops/supabase-store.mjs).
   */
  queryHistoricalRuns(range: {
    workspaceId?: string;
    since: string;
    until?: string;
  }): Promise<HistoricalAgentOpsRun[]>;
}

class SupabaseAgentOpsRepository implements AgentOpsRepository {
  async queryHistoricalRuns(range: {
    workspaceId?: string;
    since: string;
    until?: string;
  }): Promise<HistoricalAgentOpsRun[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    try {
      // `workspaces.id` is always `computeWorkspaceId(backendId, path)` (see
      // AGENTS.md's AgentOps Control Tower notes) -- the raw `workspace_id`
      // column on `agentops_runs` is that hash, not a human-readable path.
      // Embed the joined `workspaces.path` here (same `runToRow`/`rowToRun`
      // pattern the collector itself uses) so this historical read returns
      // the real folder path a caller can render or compare against every
      // other AgentOps/workspace surface, instead of leaking the hash.
      let query = supabase
        .from("agentops_runs")
        .select(
          "run_id, workspace_id, agent_name, status, cost_usd, updated_at, workspaces(path)",
        )
        .gte("updated_at", range.since)
        .order("updated_at", { ascending: false });
      if (range.workspaceId)
        query = query.eq("workspace_id", range.workspaceId);
      if (range.until) query = query.lte("updated_at", range.until);
      const { data, error } = await query;
      if (error || !data) return [];
      return data.map((row) => {
        const joinedWorkspace = row.workspaces as { path?: string } | null;
        return {
          runId: row.run_id as string,
          workspaceId:
            joinedWorkspace?.path ?? (row.workspace_id as string | null),
          agentName: row.agent_name as string | null,
          status: row.status as string | null,
          costUsd: Number(row.cost_usd ?? 0),
          updatedAt: row.updated_at as string,
        };
      });
    } catch {
      return [];
    }
  }
}

export const agentOpsRepository: AgentOpsRepository =
  new SupabaseAgentOpsRepository();
