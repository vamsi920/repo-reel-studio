import {
  supabase,
  isSupabaseConfigured,
  getAuthUser,
} from "#/lib/data-platform/client";
import { resolveOrgId } from "#/lib/data-platform/repositories/repository-identity";
import { connectionsRepository } from "#/lib/data-platform/repositories/connections-repository";
import { needsReconnect } from "#/lib/environment/connection-health";

/**
 * What the onboarding agent is told about existing connections.
 *
 * `describe` used to return only the catalogue of what COULD be connected,
 * while the tool description and the system brief both promised "what is
 * already connected". The agent therefore re-asked for providers that were
 * healthy, and never noticed one that had died. This reads the same table the
 * Environment page does, so the two cannot disagree.
 *
 * Contains no credentials -- `connections` exposes only the safe columns to
 * the browser, and only those are read here.
 */
export interface ConnectionSnapshotEntry {
  provider: string;
  capability: string;
  status: string;
  needs_reconnect: boolean;
  account: string | null;
  granted_scopes: string[];
  last_probe_at: string | null;
  expires_at: string | null;
  /**
   * Whether the current user authorised this connection. GitHub repository
   * access is per person: an org-level GitHub connection made by a colleague
   * does not give THIS user's repository picker their own repositories.
   */
  connected_by_you: boolean | null;
}

export interface ConnectionSnapshot {
  connections: ConnectionSnapshotEntry[];
  /** Whether this user may connect/disconnect (org admin or owner). */
  can_write_connections: boolean | null;
  /** Set when the lookup itself failed, so "none" is never claimed falsely. */
  lookup_error?: string;
}

const WRITE_ROLES = new Set(["admin", "owner"]);

export async function snapshotConnections(): Promise<ConnectionSnapshot> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      connections: [],
      can_write_connections: null,
      lookup_error: "supabase_not_configured",
    };
  }
  try {
    const orgId = await resolveOrgId();
    if (!orgId) {
      return {
        connections: [],
        can_write_connections: null,
        lookup_error: "org_unresolved",
      };
    }
    const records = await connectionsRepository.list(orgId);

    let canWrite: boolean | null = null;
    const {
      data: { user },
    } = await getAuthUser();
    if (user) {
      const { data } = await supabase
        .from("org_members")
        .select("role")
        .eq("org_id", orgId)
        .eq("user_id", user.id)
        .maybeSingle();
      canWrite = data ? WRITE_ROLES.has(data.role as string) : null;
    }

    return {
      connections: records.map((record) => ({
        provider: record.providerId,
        capability: record.capability,
        status: record.status,
        needs_reconnect: needsReconnect(record),
        account: record.displayName,
        granted_scopes: record.grantedScopes,
        last_probe_at: record.lastProbeAt,
        expires_at: record.expiresAt,
        connected_by_you: user ? record.createdBy === user.id : null,
      })),
      can_write_connections: canWrite,
    };
  } catch {
    return {
      connections: [],
      can_write_connections: null,
      lookup_error: "connections_unavailable",
    };
  }
}
