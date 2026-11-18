import { I18nKey } from "#/i18n/declaration";

/**
 * Codes the team functions in the database raise (as the message of a P0001
 * error), plus the few the client adds itself.
 */
export const TEAM_ERROR_CODES = [
  "not_signed_in",
  "not_authorized",
  "owner_required",
  "team_not_found",
  "member_not_found",
  "last_owner",
  "personal_team",
  "invalid_name",
  "invalid_role",
  "invalid_target",
  "invalid_visibility",
  "confirmation_mismatch",
  "use_leave",
  "too_many_teams",
  "too_many_emails",
  "too_many_invites",
  "no_emails",
  "invite_not_found",
  "invite_expired",
  "invite_revoked",
  "invite_declined",
  "invite_already_accepted",
  "invite_email_mismatch",
  "workspace_not_found",
  "workspace_owner",
  "not_configured",
  "unknown",
] as const;

export type TeamErrorCode = (typeof TEAM_ERROR_CODES)[number];

export class TeamError extends Error {
  readonly code: TeamErrorCode;

  constructor(code: TeamErrorCode, detail?: string) {
    super(detail ?? code);
    this.name = "TeamError";
    this.code = code;
  }
}

function isTeamErrorCode(value: string): value is TeamErrorCode {
  return (TEAM_ERROR_CODES as readonly string[]).includes(value);
}

/** Turns whatever Supabase returned into a `TeamError` with a known code. */
export function toTeamError(error: unknown): TeamError {
  if (error instanceof TeamError) return error;
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message ?? "")
      : String(error ?? "");
  const code = message.trim();
  return isTeamErrorCode(code)
    ? new TeamError(code)
    : new TeamError("unknown", message);
}

const MESSAGE_KEYS: Record<TeamErrorCode, I18nKey> = {
  not_signed_in: I18nKey.TEAM$ERROR_NOT_SIGNED_IN,
  not_authorized: I18nKey.TEAM$ERROR_NOT_AUTHORIZED,
  owner_required: I18nKey.TEAM$ERROR_OWNER_REQUIRED,
  team_not_found: I18nKey.TEAM$ERROR_TEAM_NOT_FOUND,
  member_not_found: I18nKey.TEAM$ERROR_MEMBER_NOT_FOUND,
  last_owner: I18nKey.TEAM$ERROR_LAST_OWNER,
  personal_team: I18nKey.TEAM$ERROR_PERSONAL_TEAM,
  invalid_name: I18nKey.TEAM$ERROR_INVALID_NAME,
  invalid_role: I18nKey.TEAM$ERROR_GENERIC,
  invalid_target: I18nKey.TEAM$ERROR_GENERIC,
  invalid_visibility: I18nKey.TEAM$ERROR_GENERIC,
  confirmation_mismatch: I18nKey.TEAM$ERROR_CONFIRMATION_MISMATCH,
  use_leave: I18nKey.TEAM$ERROR_GENERIC,
  too_many_teams: I18nKey.TEAM$ERROR_TOO_MANY_TEAMS,
  too_many_emails: I18nKey.TEAM$ERROR_TOO_MANY_EMAILS,
  too_many_invites: I18nKey.TEAM$ERROR_TOO_MANY_INVITES,
  no_emails: I18nKey.TEAM$ERROR_NO_EMAILS,
  invite_not_found: I18nKey.TEAM$ERROR_INVITE_NOT_FOUND,
  invite_expired: I18nKey.TEAM$ERROR_INVITE_EXPIRED,
  invite_revoked: I18nKey.TEAM$ERROR_INVITE_REVOKED,
  invite_declined: I18nKey.TEAM$ERROR_INVITE_DECLINED,
  invite_already_accepted: I18nKey.TEAM$ERROR_INVITE_ALREADY_ACCEPTED,
  invite_email_mismatch: I18nKey.TEAM$ERROR_INVITE_EMAIL_MISMATCH,
  workspace_not_found: I18nKey.TEAM$ERROR_WORKSPACE_NOT_FOUND,
  workspace_owner: I18nKey.TEAM$ERROR_WORKSPACE_OWNER,
  not_configured: I18nKey.TEAM$ERROR_NOT_CONFIGURED,
  unknown: I18nKey.TEAM$ERROR_GENERIC,
};

/** The translation key to show for a failed team action. */
export function teamErrorMessageKey(error: unknown): I18nKey {
  return MESSAGE_KEYS[toTeamError(error).code];
}
