import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";

/** Postgres unique violation: the workspace row is already there. */
const WORKSPACE_EXISTS = "23505";

export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

export interface WorkspaceRow {
  id: string;
  orgId: string;
  backendId: string;
  path: string;
  name: string | null;
}

/**
 * `id` is always the `computeWorkspaceId()` string
 * (see src/lib/workspace-memory/workspace-id.ts) -- never a fresh uuid.
 */
export interface WorkspaceRepository {
  ensureWorkspace(input: {
    id: string;
    orgId: string;
    backendId: string;
    path: string;
    name?: string;
  }): Promise<{ ok: boolean; error?: string }>;
  listWorkspacesForOrg(orgId: string): Promise<WorkspaceRow[]>;
}

class SupabaseWorkspaceRepository implements WorkspaceRepository {
  async ensureWorkspace(input: {
    id: string;
    orgId: string;
    backendId: string;
    path: string;
    name?: string;
  }): Promise<{ ok: boolean; error?: string }> {
    if (!isSupabaseConfigured || !supabase) return { ok: true };
    try {
      // A plain insert, not an upsert. An upsert's conflict branch is an
      // UPDATE, which only the workspace's admins may run -- so a teammate
      // opening a workspace someone else already registered was refused
      // outright. 23505 (the row exists) is the normal "already registered"
      // answer, whoever registered it.
      const row: Record<string, unknown> = {
        id: input.id,
        org_id: input.orgId,
        backend_id: input.backendId,
        path: input.path,
      };
      if (input.name !== undefined) row.name = input.name;
      const { error } = await supabase.from("workspaces").insert(row);
      if (error && error.code !== WORKSPACE_EXISTS) {
        return { ok: false, error: error.message };
      }
      if (error && input.name !== undefined) {
        // Keep the friendly name current. Best-effort: row level security
        // turns this into a no-op for someone who may not rename the
        // workspace, and a team never changes here (the database keeps a
        // workspace in the team that created it).
        await supabase
          .from("workspaces")
          .update({ name: input.name })
          .eq("id", input.id)
          .is("name", null);
      }
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async listWorkspacesForOrg(orgId: string): Promise<WorkspaceRow[]> {
    if (!isSupabaseConfigured || !supabase || !orgId) return [];
    try {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, org_id, backend_id, path, name")
        .eq("org_id", orgId);
      if (error || !data) return [];
      return data.map((row) => ({
        id: row.id,
        orgId: row.org_id,
        backendId: row.backend_id,
        path: row.path,
        name: row.name,
      }));
    } catch {
      return [];
    }
  }
}

export const workspaceRepository: WorkspaceRepository =
  new SupabaseWorkspaceRepository();
