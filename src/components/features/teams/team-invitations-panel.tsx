import React from "react";
import { useTranslation } from "react-i18next";
import { UserPlus } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { BrandButton } from "#/components/features/settings/brand-button";
import { teamRepository } from "#/lib/data-platform/repositories/team-repository";
import type { ActiveTeam } from "#/lib/data-platform/repositories/repository-identity";
import { useTeamInvites, useTeamMutation } from "#/hooks/query/use-teams";
import { buildInviteLink } from "#/lib/teams/invites";
import { canManageTeam } from "#/lib/teams/roles";
import type { TeamInvite } from "#/lib/teams/types";
import { formatDate } from "#/utils/format-relative-time";
import { CopyLinkField } from "./copy-link-field";
import { InviteMembersModal } from "./invite-members-modal";
import {
  INVITE_STATUS_LABEL_KEY,
  ROLE_LABEL_KEY,
  teamCardClassName,
  teamMutedTextClassName,
} from "./team-labels";

interface TeamInvitationsPanelProps {
  team: ActiveTeam;
}

/** Invitations that have not been accepted yet, for team owners and admins. */
export function TeamInvitationsPanel({ team }: TeamInvitationsPanelProps) {
  const { t, i18n } = useTranslation("openhands");
  const canManage = canManageTeam(team.role) && !team.isPersonal;
  const {
    data: invites,
    isPending,
    isError,
  } = useTeamInvites(team.id, canManage);
  const [isInviting, setIsInviting] = React.useState(false);
  // The one freshly issued link on screen. A link is shown only when it is
  // created: the database keeps a hash of it, never the link itself.
  const [freshLink, setFreshLink] = React.useState<{
    inviteId: string;
    email: string;
    link: string;
  } | null>(null);

  const revoke = useTeamMutation((inviteId: string) =>
    teamRepository.revokeInvite(inviteId),
  );
  const regenerate = useTeamMutation(async (invite: TeamInvite) => {
    const token = await teamRepository.regenerateInvite(invite.id);
    setFreshLink({
      inviteId: invite.id,
      email: invite.email,
      link: buildInviteLink(token),
    });
  });
  const reinvite = useTeamMutation(async (invite: TeamInvite) => {
    const [outcome] = await teamRepository.createInvites(
      team.id,
      [invite.email],
      invite.role,
    );
    if (outcome?.token && outcome.inviteId) {
      setFreshLink({
        inviteId: outcome.inviteId,
        email: invite.email,
        link: buildInviteLink(outcome.token),
      });
    }
  });
  const isBusy = revoke.isPending || regenerate.isPending || reinvite.isPending;

  if (team.isPersonal) {
    return (
      <p data-testid="invitations-personal" className={teamMutedTextClassName}>
        {t(I18nKey.TEAM$PERSONAL_NO_INVITES)}
      </p>
    );
  }
  if (!canManage) {
    return (
      <p data-testid="invitations-forbidden" className={teamMutedTextClassName}>
        {t(I18nKey.TEAM$ADMINS_ONLY)}
      </p>
    );
  }

  return (
    <section
      data-testid="team-invitations-panel"
      className="flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={teamMutedTextClassName}>
          {t(I18nKey.TEAM$INVITATIONS_HINT)}
        </p>
        <BrandButton
          testId="invite-members-button"
          type="button"
          variant="primary"
          startContent={<UserPlus size={16} />}
          onClick={() => setIsInviting(true)}
        >
          {t(I18nKey.TEAM$INVITE_BUTTON)}
        </BrandButton>
      </div>

      {isError ? (
        <p role="alert" className="text-sm text-red-500">
          {t(I18nKey.TEAM$LOAD_FAILED)}
        </p>
      ) : null}

      {!isPending && (invites ?? []).length === 0 ? (
        <p
          data-testid="invitations-empty"
          className={`${teamCardClassName} p-6 text-center ${teamMutedTextClassName}`}
        >
          {t(I18nKey.TEAM$INVITATIONS_EMPTY)}
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {(invites ?? []).map((invite) => (
          <li
            key={invite.id}
            data-testid="team-invite-row"
            className={`${teamCardClassName} flex flex-col gap-3 p-4`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="break-all text-sm text-[var(--text-primary)]">
                  {invite.email}
                </span>
                <span className="text-xs text-[var(--text-secondary)]">
                  {t(ROLE_LABEL_KEY[invite.role])}
                  {" · "}
                  <span data-testid="team-invite-status">
                    {t(INVITE_STATUS_LABEL_KEY[invite.status])}
                  </span>
                  {invite.status === "pending" && invite.expiresAt
                    ? ` · ${t(I18nKey.TEAM$INVITE_EXPIRES, {
                        date: formatDate(invite.expiresAt, i18n.language),
                      })}`
                    : null}
                </span>
              </div>
              <div className="flex gap-2">
                {invite.status === "declined" ? (
                  <BrandButton
                    testId="invite-again-button"
                    type="button"
                    variant="secondary"
                    isDisabled={isBusy}
                    onClick={() => reinvite.mutate(invite)}
                  >
                    {t(I18nKey.TEAM$INVITE_AGAIN)}
                  </BrandButton>
                ) : (
                  <BrandButton
                    testId="invite-new-link-button"
                    type="button"
                    variant="secondary"
                    isDisabled={isBusy}
                    onClick={() => regenerate.mutate(invite)}
                  >
                    {t(I18nKey.TEAM$INVITE_NEW_LINK)}
                  </BrandButton>
                )}
                <BrandButton
                  testId="invite-revoke-button"
                  type="button"
                  variant="ghost-danger"
                  isDisabled={isBusy}
                  onClick={() => revoke.mutate(invite.id)}
                >
                  {t(I18nKey.TEAM$INVITE_REVOKE)}
                </BrandButton>
              </div>
            </div>
            {freshLink?.inviteId === invite.id ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-[var(--text-secondary)]">
                  {t(I18nKey.TEAM$INVITE_NEW_LINK_NOTE)}
                </span>
                <CopyLinkField
                  testId="invite-link"
                  label={t(I18nKey.TEAM$INVITE_LINK_FOR, {
                    email: freshLink.email,
                  })}
                  link={freshLink.link}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {isInviting ? (
        <InviteMembersModal
          teamId={team.id}
          teamName={team.name}
          onClose={() => setIsInviting(false)}
        />
      ) : null}
    </section>
  );
}
