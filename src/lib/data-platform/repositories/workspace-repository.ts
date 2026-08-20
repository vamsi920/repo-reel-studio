import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";

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
      const { error } = await supabase.from("workspaces").upsert(
        {
          id: input.id,
          org_id: input.orgId,
          backend_id: input.backendId,
          path: input.path,
          name: input.name ?? null,
        },
        { onConflict: "id" },
      );
      if (error) return { ok: false, error: error.message };
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
