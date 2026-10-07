import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";

/**
 * Read-only view of the connection activity log (`connection_events`).
 * Rows are written only by service-role Edge Functions and hold no secrets.
 */
export type ConnectionEventAction =
  | "connected"
  | "disconnected"
  | "refreshed"
  | "status_changed";

export interface ConnectionEventRecord {
  id: string;
  providerId: string;
  instanceKey: string;
  action: ConnectionEventAction;
  status: string | null;
  actor: string | null;
  createdAt: string;
}

const SELECT_COLUMNS =
  "id, provider_id, instance_key, action, status, actor, created_at";

export const CONNECTION_EVENTS_PAGE_SIZE = 20;

export async function listConnectionEvents(
  orgId: string,
  limit: number = CONNECTION_EVENTS_PAGE_SIZE,
): Promise<ConnectionEventRecord[]> {
  if (!isSupabaseConfigured || !supabase || !orgId) return [];
  const { data, error } = await supabase
    .from("connection_events")
    .select(SELECT_COLUMNS)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[connection-events-repository] list failed", error);
    throw new Error("Failed to load connection activity");
  }
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    providerId: row.provider_id as string,
    instanceKey: row.instance_key as string,
    action: row.action as ConnectionEventAction,
    status: (row.status as string | null) ?? null,
    actor: (row.actor as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
}
