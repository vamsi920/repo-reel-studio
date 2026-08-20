import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";

/**
 * Broader than `WorkspaceActivityEvent` (src/lib/workspace-memory/types.ts) --
 * that type covers only memory-mirror events. `activity_events` is the
 * workspace-wide feed (memory, agentops, knowledge, automations, ...), so
 * `kind` is intentionally an open string here, matching the table's design.
 */
export interface ActivityEvent {
  workspaceId: string;
  actor: "user" | "agent" | "system";
  kind: string;
  summary: string;
  message?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export interface ActivityStore {
  record(event: ActivityEvent): Promise<void>;
  subscribe(
    workspaceId: string,
    onEvent: (event: ActivityEvent) => void,
  ): () => void;
}

class SupabaseActivityStore implements ActivityStore {
  async record(event: ActivityEvent): Promise<void> {
    if (!isSupabaseConfigured || !supabase || !event.workspaceId) return;
    try {
      await supabase.from("activity_events").insert({
        workspace_id: event.workspaceId,
        actor: event.actor,
        kind: event.kind,
        summary: event.summary,
        message: event.message ?? null,
        entity_type: event.entityType ?? null,
        entity_id: event.entityId ?? null,
        metadata: event.metadata ?? {},
      });
    } catch {
      // Best-effort: the activity feed is a UI convenience, never a path
      // anything else depends on for correctness.
    }
  }

  subscribe(
    workspaceId: string,
    onEvent: (event: ActivityEvent) => void,
  ): () => void {
    if (!isSupabaseConfigured || !supabase || !workspaceId) return () => {};
    const client = supabase;
    const channel = client
      .channel(`activity:${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity_events",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          onEvent({
            workspaceId: row.workspace_id as string,
            actor: row.actor as ActivityEvent["actor"],
            kind: row.kind as string,
            summary: row.summary as string,
            message: (row.message as string | null) ?? undefined,
            entityType: (row.entity_type as string | null) ?? undefined,
            entityId: (row.entity_id as string | null) ?? undefined,
            metadata: (row.metadata as Record<string, unknown>) ?? {},
          });
        },
      )
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }
}

export const activityStore: ActivityStore = new SupabaseActivityStore();
