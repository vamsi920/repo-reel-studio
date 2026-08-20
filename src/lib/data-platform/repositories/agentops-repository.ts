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
      let query = supabase
        .from("agentops_runs")
        .select(
          "run_id, workspace_id, agent_name, status, cost_usd, updated_at",
        )
        .gte("updated_at", range.since)
        .order("updated_at", { ascending: false });
      if (range.workspaceId)
        query = query.eq("workspace_id", range.workspaceId);
      if (range.until) query = query.lte("updated_at", range.until);
      const { data, error } = await query;
      if (error || !data) return [];
      return data.map((row) => ({
        runId: row.run_id as string,
        workspaceId: row.workspace_id as string | null,
        agentName: row.agent_name as string | null,
        status: row.status as string | null,
        costUsd: Number(row.cost_usd ?? 0),
        updatedAt: row.updated_at as string,
      }));
    } catch {
      return [];
    }
  }
}

export const agentOpsRepository: AgentOpsRepository =
  new SupabaseAgentOpsRepository();
