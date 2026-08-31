import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";
import type { Capability } from "#/lib/environment/types/capability";
import type {
  ConnectionStatus,
  ProbeResult,
} from "#/lib/environment/types/probe";

/**
 * Read-only from the browser, exactly like
 * `github-connections-repository.ts`: `connections` has a select policy and
 * no write policy at all, so every mutation goes through a service-role Edge
 * Function (connections-oauth-*, connections-set-credentials,
 * connections-disconnect).
 *
 * The encrypted credential columns are additionally revoked at the column
 * level, so `select *` would fail rather than leak ciphertext -- the explicit
 * column list below is the only thing this client can read.
 */
export interface ConnectionRecord {
  id: string;
  orgId: string;
  capability: Capability;
  providerId: string;
  instanceKey: string;
  displayName: string | null;
  config: Record<string, string | number | boolean>;
  redactedSummary: Record<string, string>;
  requestedScopes: string[];
  grantedScopes: string[];
  status: ConnectionStatus;
  lastProbe: ProbeResult | null;
  lastProbeAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const SELECT_COLUMNS = [
  "id",
  "org_id",
  "capability",
  "provider_id",
  "instance_key",
  "display_name",
  "config",
  "redacted_summary",
  "requested_scopes",
  "granted_scopes",
  "status",
  "last_probe",
  "last_probe_at",
  "expires_at",
  "created_at",
  "updated_at",
].join(", ");

function toRecord(row: Record<string, unknown>): ConnectionRecord {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    capability: row.capability as Capability,
    providerId: row.provider_id as string,
    instanceKey: row.instance_key as string,
    displayName: (row.display_name as string | null) ?? null,
    config: (row.config as ConnectionRecord["config"]) ?? {},
    redactedSummary: (row.redacted_summary as Record<string, string>) ?? {},
    requestedScopes: (row.requested_scopes as string[]) ?? [],
    grantedScopes: (row.granted_scopes as string[]) ?? [],
    status: row.status as ConnectionStatus,
    lastProbe: (row.last_probe as ProbeResult | null) ?? null,
    lastProbeAt: (row.last_probe_at as string | null) ?? null,
    expiresAt: (row.expires_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export interface ConnectionsRepository {
  list(orgId: string): Promise<ConnectionRecord[]>;
}

class SupabaseConnectionsRepository implements ConnectionsRepository {
  async list(orgId: string): Promise<ConnectionRecord[]> {
    if (!isSupabaseConfigured || !supabase || !orgId) return [];
    const { data, error } = await supabase
      .from("connections")
      .select(SELECT_COLUMNS)
      .eq("org_id", orgId)
      .order("capability", { ascending: true });
    if (error || !data) return [];
    return (data as unknown as Record<string, unknown>[]).map(toRecord);
  }
}

export const connectionsRepository: ConnectionsRepository =
  new SupabaseConnectionsRepository();
