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
  id: string;
  occurredAt: string;
}

export interface UsageRepository {
  /** Returns the inserted row's server-generated id, or null on any failure. */
  recordEvent(input: UsageEventInput): Promise<string | null>;
  listEvents(workspaceId: string, since: string): Promise<UsageEventRow[]>;
  /**
   * Live cross-tab feed: fires `onEvent` for every `usage_events` row
   * inserted for this workspace by ANY session, including this tab's own
   * writes (their Realtime echo). Callers must upsert by `id`, not append --
   * that is what makes an own-tab echo collapse into the already-recorded
   * local event instead of double-counting it.
   */
  subscribe(
    workspaceId: string,
    onEvent: (event: UsageEventRow) => void,
  ): () => void;
}

function toUsageEventRow(row: Record<string, unknown>): UsageEventRow {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    source: row.source as UsageSource,
    runId: (row.run_id as string | null) ?? undefined,
    automationId: (row.automation_id as string | null) ?? undefined,
    costUsd: (row.cost_usd as number | null) ?? undefined,
    tokens: (row.tokens as Record<string, unknown> | null) ?? undefined,
    occurredAt: row.occurred_at as string,
  };
}

class SupabaseUsageRepository implements UsageRepository {
  async recordEvent(input: UsageEventInput): Promise<string | null> {
    if (!isSupabaseConfigured || !supabase || !input.workspaceId) return null;
    try {
      const { data, error } = await supabase
        .from("usage_events")
        .insert({
          workspace_id: input.workspaceId,
          source: input.source,
          run_id: input.runId ?? null,
          automation_id: input.automationId ?? null,
          cost_usd: input.costUsd ?? null,
          tokens: input.tokens ?? null,
        })
        .select("id")
        .single();
      if (error || !data) return null;
      return data.id as string;
    } catch {
      // Best-effort -- Usage is a reporting surface, never a blocking path.
      return null;
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
          "id, workspace_id, source, run_id, automation_id, cost_usd, tokens, occurred_at",
        )
        .eq("workspace_id", workspaceId)
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false });
      if (error || !data) return [];
      return data.map(toUsageEventRow);
    } catch {
      return [];
    }
  }

  subscribe(
    workspaceId: string,
    onEvent: (event: UsageEventRow) => void,
  ): () => void {
    if (!isSupabaseConfigured || !supabase || !workspaceId) return () => {};
    const client = supabase;
    const channel = client
      .channel(`usage:${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "usage_events",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          onEvent(toUsageEventRow(payload.new as Record<string, unknown>));
        },
      )
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }
}

export const usageRepository: UsageRepository = new SupabaseUsageRepository();
