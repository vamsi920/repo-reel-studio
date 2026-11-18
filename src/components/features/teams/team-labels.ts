import { I18nKey } from "#/i18n/declaration";
import type {
  InviteOutcomeStatus,
  InviteStatus,
  TeamRole,
  WorkspaceVisibility,
} from "#/lib/teams/types";

export const ROLE_LABEL_KEY: Record<TeamRole, I18nKey> = {
  owner: I18nKey.TEAM$ROLE_OWNER,
  admin: I18nKey.TEAM$ROLE_ADMIN,
  member: I18nKey.TEAM$ROLE_MEMBER,
  viewer: I18nKey.TEAM$ROLE_VIEWER,
};

export const ROLE_HINT_KEY: Record<TeamRole, I18nKey> = {
  owner: I18nKey.TEAM$ROLE_OWNER_HINT,
  admin: I18nKey.TEAM$ROLE_ADMIN_HINT,
  member: I18nKey.TEAM$ROLE_MEMBER_HINT,
  viewer: I18nKey.TEAM$ROLE_VIEWER_HINT,
};

export const INVITE_STATUS_LABEL_KEY: Record<InviteStatus, I18nKey> = {
  pending: I18nKey.TEAM$INVITE_STATUS_PENDING,
  expired: I18nKey.TEAM$INVITE_STATUS_EXPIRED,
  declined: I18nKey.TEAM$INVITE_STATUS_DECLINED,
  accepted: I18nKey.TEAM$INVITE_STATUS_ACCEPTED,
  revoked: I18nKey.TEAM$INVITE_STATUS_REVOKED,
  not_found: I18nKey.TEAM$INVITE_STATUS_NOT_FOUND,
};

export const INVITE_OUTCOME_LABEL_KEY: Record<InviteOutcomeStatus, I18nKey> = {
  invited: I18nKey.TEAM$INVITE_OUTCOME_INVITED,
  reinvited: I18nKey.TEAM$INVITE_OUTCOME_REINVITED,
  already_member: I18nKey.TEAM$INVITE_OUTCOME_ALREADY_MEMBER,
  invalid_email: I18nKey.TEAM$INVITE_OUTCOME_INVALID_EMAIL,
  domain_not_allowed: I18nKey.TEAM$INVITE_OUTCOME_DOMAIN_NOT_ALLOWED,
};

export const VISIBILITY_LABEL_KEY: Record<WorkspaceVisibility, I18nKey> = {
  team: I18nKey.TEAM$WORKSPACE_VISIBILITY_TEAM,
  restricted: I18nKey.TEAM$WORKSPACE_VISIBILITY_RESTRICTED,
};

export const VISIBILITY_HINT_KEY: Record<WorkspaceVisibility, I18nKey> = {
  team: I18nKey.TEAM$WORKSPACE_VISIBILITY_TEAM_HINT,
  restricted: I18nKey.TEAM$WORKSPACE_VISIBILITY_RESTRICTED_HINT,
};

/** Audit actions the database writes, as the label shown in the activity list. */
export const AUDIT_ACTION_LABEL_KEY: Record<string, I18nKey> = {
  "team.created": I18nKey.TEAM$AUDIT_TEAM_CREATED,
  "team.renamed": I18nKey.TEAM$AUDIT_TEAM_RENAMED,
  "team.ownership_transferred": I18nKey.TEAM$AUDIT_OWNERSHIP_TRANSFERRED,
  "member.joined": I18nKey.TEAM$AUDIT_MEMBER_JOINED,
  "member.left": I18nKey.TEAM$AUDIT_MEMBER_LEFT,
  "member.removed": I18nKey.TEAM$AUDIT_MEMBER_REMOVED,
  "member.role_changed": I18nKey.TEAM$AUDIT_MEMBER_ROLE_CHANGED,
  "invite.created": I18nKey.TEAM$AUDIT_INVITE_CREATED,
  "invite.resent": I18nKey.TEAM$AUDIT_INVITE_RESENT,
  "invite.revoked": I18nKey.TEAM$AUDIT_INVITE_REVOKED,
  "invite.declined": I18nKey.TEAM$AUDIT_INVITE_DECLINED,
  "workspace.renamed": I18nKey.TEAM$AUDIT_WORKSPACE_RENAMED,
  "workspace.visibility_changed":
    I18nKey.TEAM$AUDIT_WORKSPACE_VISIBILITY_CHANGED,
  "workspace.member_set": I18nKey.TEAM$AUDIT_WORKSPACE_MEMBER_SET,
  "workspace.member_removed": I18nKey.TEAM$AUDIT_WORKSPACE_MEMBER_REMOVED,
  "workspace.deleted": I18nKey.TEAM$AUDIT_WORKSPACE_DELETED,
};

/** Shared surface classes so every team panel reads as one screen. */
export const teamCardClassName =
  "rounded-xl border border-[var(--oh-border)] bg-base-secondary";
export const teamMutedTextClassName = "text-sm text-[var(--text-secondary)]";
export const teamFieldClassName =
  "w-full rounded-lg border border-[var(--oh-border)] bg-[var(--oh-color-base)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary-500)] disabled:opacity-60";
