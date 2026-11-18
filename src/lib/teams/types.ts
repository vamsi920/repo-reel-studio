/**
 * Team and workspace management types.
 *
 * Vocabulary: a TEAM is an `orgs` row (the people who share connections,
 * knowledge and workspaces); a WORKSPACE is a `workspaces` row (a folder or
 * repository the team works in). Every user also has one personal team that
 * nobody else can join.
 */

export const TEAM_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

/** Roles an invitation can carry. Ownership is transferred, never invited. */
export const INVITE_ROLES = ["admin", "member", "viewer"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

export type WorkspaceVisibility = "team" | "restricted";

export interface TeamSummary {
  id: string;
  name: string;
  isPersonal: boolean;
  role: TeamRole;
  memberCount: number;
  createdAt: string;
}

export interface TeamMember {
  userId: string;
  email: string | null;
  role: TeamRole;
  joinedAt: string;
  invitedByEmail: string | null;
}

export type InviteStatus =
  | "pending"
  | "expired"
  | "declined"
  | "accepted"
  | "revoked"
  | "not_found";

export interface TeamInvite {
  id: string;
  email: string;
  role: InviteRole;
  status: InviteStatus;
  invitedByEmail: string | null;
  createdAt: string;
  expiresAt: string;
}

export type InviteOutcomeStatus =
  | "invited"
  | "reinvited"
  | "already_member"
  | "invalid_email"
  | "domain_not_allowed";

/** What happened to one address in a bulk invite. */
export interface InviteOutcome {
  email: string;
  status: InviteOutcomeStatus;
  inviteId: string | null;
  /** The link token. Present only for `invited` / `reinvited`, only here. */
  token: string | null;
}

/** An invitation addressed to the signed-in user's own email. */
export interface MyInvite {
  id: string;
  teamId: string;
  teamName: string;
  role: InviteRole;
  invitedByEmail: string | null;
  createdAt: string;
  expiresAt: string;
}

/** What an invitation link points at. */
export interface InvitePreview {
  status: InviteStatus;
  teamId?: string;
  teamName?: string;
  role?: InviteRole;
  email?: string;
  invitedByEmail?: string | null;
  expiresAt?: string;
  emailMatches?: boolean;
  alreadyMember?: boolean;
}

export interface TeamWorkspace {
  id: string;
  name: string | null;
  path: string;
  backendId: string;
  visibility: WorkspaceVisibility;
  myRole: TeamRole | null;
  memberCount: number;
  createdByEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  userId: string;
  email: string | null;
  role: TeamRole;
  addedAt: string;
}

export interface TeamAuditEntry {
  id: number;
  actorEmail: string | null;
  action: string;
  targetLabel: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}
