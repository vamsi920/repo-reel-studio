import { INVITE_ROLES, TEAM_ROLES } from "./types";
import type { InviteRole, TeamRole } from "./types";

/**
 * What each team role may do. The database enforces every one of these (see
 * supabase/migrations/20261118120000_team_management.sql); this module only
 * decides which controls to show, so nobody is offered a button that the
 * server would refuse.
 */

const RANK: Record<TeamRole, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

export function roleRank(role: TeamRole | null | undefined): number {
  return role ? (RANK[role] ?? 0) : 0;
}

export function hasRole(
  role: TeamRole | null | undefined,
  minimum: TeamRole,
): boolean {
  return roleRank(role) >= RANK[minimum];
}

export function isTeamRole(value: unknown): value is TeamRole {
  return (
    typeof value === "string" &&
    (TEAM_ROLES as readonly string[]).includes(value)
  );
}

/** Invite people, change roles, remove members, rename the team. */
export function canManageTeam(role: TeamRole | null | undefined): boolean {
  return hasRole(role, "admin");
}

/** Delete the team or hand it to someone else. */
export function canOwnTeam(role: TeamRole | null | undefined): boolean {
  return role === "owner";
}

export interface MemberActionContext {
  actorRole: TeamRole | null | undefined;
  actorIsTarget: boolean;
  targetRole: TeamRole;
  /** How many owners the team has right now. */
  ownerCount: number;
}

/**
 * The roles the actor may move the target to (never includes the target's
 * current role). Empty when the actor may not change this member at all.
 */
export function assignableRoles({
  actorRole,
  actorIsTarget,
  targetRole,
  ownerCount,
}: MemberActionContext): TeamRole[] {
  if (!canManageTeam(actorRole)) return [];
  // Only an owner changes an owner, and never the last one.
  if (targetRole === "owner") {
    if (actorRole !== "owner" || ownerCount <= 1) return [];
  }
  return TEAM_ROLES.filter((role) => {
    if (role === targetRole) return false;
    // Only an owner hands out ownership.
    if (role === "owner" && actorRole !== "owner") return false;
    // Nobody raises their own role.
    if (actorIsTarget && RANK[role] > RANK[targetRole]) return false;
    return true;
  });
}

/** Whether the actor may remove the target from the team. */
export function canRemoveMember({
  actorRole,
  actorIsTarget,
  targetRole,
  ownerCount,
}: MemberActionContext): boolean {
  if (actorIsTarget) return false; // Leaving is its own action.
  if (!canManageTeam(actorRole)) return false;
  if (targetRole === "owner") {
    return actorRole === "owner" && ownerCount > 1;
  }
  return true;
}

/** Whether the member may leave. The last owner must hand the team over first. */
export function canLeaveTeam(
  role: TeamRole | null | undefined,
  isPersonal: boolean,
  ownerCount: number,
): boolean {
  if (!role || isPersonal) return false;
  return role !== "owner" || ownerCount > 1;
}

/** Roles someone with `actorRole` may invite with. */
export function invitableRoles(
  actorRole: TeamRole | null | undefined,
): InviteRole[] {
  return canManageTeam(actorRole) ? [...INVITE_ROLES] : [];
}

export function countOwners(members: { role: TeamRole }[]): number {
  return members.filter((member) => member.role === "owner").length;
}
