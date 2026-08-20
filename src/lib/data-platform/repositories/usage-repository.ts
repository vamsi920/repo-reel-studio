import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";

export type UsageSource =
  | "agentops"
  | "automation_run"
  | "memory_savings"
  | "conversation";

export interface UsageEventInput {
  workspaceId: string;
  source: UsageSource;
  runId?: string;
  automationId?: string;
  costUsd?: number;
  tokens?: Record<string, unknown>;
}

export interface UsageEventRow extends UsageEventInput {
  occurredAt: string;
}

export interface UsageRepository {
  recordEvent(input: UsageEventInput): Promise<void>;
  listEvents(workspaceId: string, since: string): Promise<UsageEventRow[]>;
}

class SupabaseUsageRepository implements UsageRepository {
  async recordEvent(input: UsageEventInput): Promise<void> {
    if (!isSupabaseConfigured || !supabase || !input.workspaceId) return;
    try {
      await supabase.from("usage_events").insert({
        workspace_id: input.workspaceId,
        source: input.source,
        run_id: input.runId ?? null,
        automation_id: input.automationId ?? null,
        cost_usd: input.costUsd ?? null,
        tokens: input.tokens ?? null,
      });
    } catch {
      // Best-effort -- Usage is a reporting surface, never a blocking path.
    }
  }

  async listEvents(
    workspaceId: string,
    since: string,
  ): Promise<UsageEventRow[]> {
    if (!isSupabaseConfigured || !supabase || !workspaceId) return [];
    try {
      const { data, error } = await supabase
        .from("usage_events")
        .select(
          "workspace_id, source, run_id, automation_id, cost_usd, tokens, occurred_at",
        )
        .eq("workspace_id", workspaceId)
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false });
      if (error || !data) return [];
      return data.map((row) => ({
        workspaceId: row.workspace_id as string,
        source: row.source as UsageSource,
        runId: (row.run_id as string | null) ?? undefined,
        automationId: (row.automation_id as string | null) ?? undefined,
        costUsd: (row.cost_usd as number | null) ?? undefined,
        tokens: (row.tokens as Record<string, unknown> | null) ?? undefined,
        occurredAt: row.occurred_at as string,
      }));
    } catch {
      return [];
    }
  }
}

export const usageRepository: UsageRepository = new SupabaseUsageRepository();
