import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";
import { TeamError, toTeamError } from "#/lib/teams/errors";
import type {
  InviteOutcome,
  InvitePreview,
  InviteRole,
  MyInvite,
  TeamAuditEntry,
  TeamInvite,
  TeamMember,
  TeamRole,
  TeamSummary,
  TeamWorkspace,
  WorkspaceMember,
  WorkspaceVisibility,
} from "#/lib/teams/types";

/**
 * Team and workspace management, over the database functions in
 * supabase/migrations/20261118120000_team_management.sql.
 *
 * Every rule (who may invite, the last owner, an invitation belonging to one
 * email address) is enforced by those functions; this file only shapes the
 * rows. Every method rejects with a `TeamError` whose `code` is the reason,
 * so callers can show translated copy instead of a database message.
 */

type Row = Record<string, unknown>;

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  if (!isSupabaseConfigured || !supabase) {
    throw new TeamError("not_configured");
  }
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw toTeamError(error);
  return data as T;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export const teamRepository = {
  async listMyTeams(): Promise<TeamSummary[]> {
    const rows = await call<Row[] | null>("list_my_teams");
    return (rows ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name ?? ""),
      isPersonal: row.is_personal === true,
      role: row.role as TeamRole,
      memberCount: Number(row.member_count ?? 0),
      createdAt: String(row.created_at ?? ""),
    }));
  },

  async setActiveTeam(teamId: string): Promise<void> {
    await call("set_active_team", { target_org: teamId });
  },

  async createTeam(name: string): Promise<string> {
    return call<string>("create_team", { team_name: name });
  },

  async renameTeam(teamId: string, name: string): Promise<void> {
    await call("rename_team", { target_org: teamId, team_name: name });
  },

  async deleteTeam(teamId: string, confirmName: string): Promise<void> {
    await call("delete_team", {
      target_org: teamId,
      confirm_name: confirmName,
    });
  },

  async leaveTeam(teamId: string): Promise<void> {
    await call("leave_team", { target_org: teamId });
  },

  async transferOwnership(teamId: string, userId: string): Promise<void> {
    await call("transfer_team_ownership", {
      target_org: teamId,
      target_user: userId,
    });
  },

  async listMembers(teamId: string): Promise<TeamMember[]> {
    const rows = await call<Row[] | null>("list_team_members", {
      target_org: teamId,
    });
    return (rows ?? []).map((row) => ({
      userId: String(row.user_id),
      email: text(row.email),
      role: row.role as TeamRole,
      joinedAt: String(row.joined_at ?? ""),
      invitedByEmail: text(row.invited_by_email),
    }));
  },

  async updateMemberRole(
    teamId: string,
    userId: string,
    role: TeamRole,
  ): Promise<void> {
    await call("update_team_member_role", {
      target_org: teamId,
      target_user: userId,
      new_role: role,
    });
  },

  async removeMember(teamId: string, userId: string): Promise<void> {
    await call("remove_team_member", {
      target_org: teamId,
      target_user: userId,
    });
  },

  async createInvites(
    teamId: string,
    emails: string[],
    role: InviteRole,
  ): Promise<InviteOutcome[]> {
    const rows = await call<Row[] | null>("create_team_invites", {
      target_org: teamId,
      emails,
      invite_role: role,
    });
    return (rows ?? []).map((row) => ({
      email: String(row.email),
      status: row.status as InviteOutcome["status"],
      inviteId: text(row.invite_id),
      token: text(row.token),
    }));
  },

  async listInvites(teamId: string): Promise<TeamInvite[]> {
    const rows = await call<Row[] | null>("list_team_invites", {
      target_org: teamId,
    });
    return (rows ?? []).map((row) => ({
      id: String(row.id),
      email: String(row.email),
      role: row.role as InviteRole,
      status: row.status as TeamInvite["status"],
      invitedByEmail: text(row.invited_by_email),
      createdAt: String(row.created_at ?? ""),
      expiresAt: String(row.expires_at ?? ""),
    }));
  },

  async revokeInvite(inviteId: string): Promise<void> {
    await call("revoke_team_invite", { invite_id: inviteId });
  },

  /** Issues a fresh link (the previous one stops working). Returns the token. */
  async regenerateInvite(inviteId: string): Promise<string> {
    return call<string>("regenerate_team_invite", { invite_id: inviteId });
  },

  async getInvite(token: string): Promise<InvitePreview> {
    const row = await call<Row | null>("get_team_invite", {
      invite_token: token,
    });
    if (!row) return { status: "not_found" };
    return {
      status: (row.status as InvitePreview["status"]) ?? "not_found",
      teamId: text(row.team_id) ?? undefined,
      teamName: text(row.team_name) ?? undefined,
      role: (row.role as InviteRole | undefined) ?? undefined,
      email: text(row.email) ?? undefined,
      invitedByEmail: text(row.invited_by_email),
      expiresAt: text(row.expires_at) ?? undefined,
      emailMatches: row.email_matches === true,
      alreadyMember: row.already_member === true,
    };
  },

  /** Accepts by link. Returns the team joined. */
  async acceptInvite(token: string): Promise<string> {
    return call<string>("accept_team_invite", { invite_token: token });
  },

  async listMyInvites(): Promise<MyInvite[]> {
    const rows = await call<Row[] | null>("list_my_team_invites");
    return (rows ?? []).map((row) => ({
      id: String(row.id),
      teamId: String(row.team_id),
      teamName: String(row.team_name ?? ""),
      role: row.role as InviteRole,
      invitedByEmail: text(row.invited_by_email),
      createdAt: String(row.created_at ?? ""),
      expiresAt: String(row.expires_at ?? ""),
    }));
  },

  /** Accepts or declines an invitation addressed to the caller's email. */
  async respondToInvite(inviteId: string, accept: boolean): Promise<string> {
    return call<string>("respond_to_team_invite", {
      invite_id: inviteId,
      accept,
    });
  },

  async listWorkspaces(teamId: string): Promise<TeamWorkspace[]> {
    const rows = await call<Row[] | null>("list_team_workspaces", {
      target_org: teamId,
    });
    return (rows ?? []).map((row) => ({
      id: String(row.id),
      name: text(row.name),
      path: String(row.path ?? ""),
      backendId: String(row.backend_id ?? ""),
      visibility: row.visibility as WorkspaceVisibility,
      myRole: (row.my_role as TeamRole | null) ?? null,
      memberCount: Number(row.member_count ?? 0),
      createdByEmail: text(row.created_by_email),
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? ""),
    }));
  },

  async updateWorkspace(
    workspaceId: string,
    changes: { name?: string; visibility?: WorkspaceVisibility },
  ): Promise<void> {
    await call("update_team_workspace", {
      ws_id: workspaceId,
      new_name: changes.name ?? null,
      new_visibility: changes.visibility ?? null,
    });
  },

  async listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const rows = await call<Row[] | null>("list_workspace_members", {
      ws_id: workspaceId,
    });
    return (rows ?? []).map((row) => ({
      userId: String(row.user_id),
      email: text(row.email),
      role: row.role as TeamRole,
      addedAt: String(row.added_at ?? ""),
    }));
  },

  async setWorkspaceMember(
    workspaceId: string,
    userId: string,
    role: InviteRole,
  ): Promise<void> {
    await call("set_workspace_member", {
      ws_id: workspaceId,
      target_user: userId,
      new_role: role,
    });
  },

  async removeWorkspaceMember(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    await call("remove_workspace_member", {
      ws_id: workspaceId,
      target_user: userId,
    });
  },

  async deleteWorkspace(workspaceId: string): Promise<void> {
    await call("delete_team_workspace", { ws_id: workspaceId });
  },

  /** Newest first. Readable by team owners and admins only. */
  async listAuditLog(teamId: string, limit = 100): Promise<TeamAuditEntry[]> {
    if (!isSupabaseConfigured || !supabase) {
      throw new TeamError("not_configured");
    }
    const { data, error } = await supabase
      .from("team_audit_log")
      .select("id, actor_email, action, target_label, metadata, created_at")
      .eq("org_id", teamId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw toTeamError(error);
    return (data ?? []).map((row) => ({
      id: Number(row.id),
      actorEmail: text(row.actor_email),
      action: String(row.action),
      targetLabel: text(row.target_label),
      metadata: (row.metadata as Record<string, unknown> | null) ?? {},
      createdAt: String(row.created_at ?? ""),
    }));
  },
};

export type TeamRepository = typeof teamRepository;
