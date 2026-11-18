import { useTranslation } from "react-i18next";
import { MailOpen } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { BrandButton } from "#/components/features/settings/brand-button";
import { teamRepository } from "#/lib/data-platform/repositories/team-repository";
import {
  switchActiveTeam,
  useMyInvites,
  useTeamMutation,
} from "#/hooks/query/use-teams";
import type { MyInvite } from "#/lib/teams/types";
import { ROLE_LABEL_KEY, teamCardClassName } from "./team-labels";

/**
 * Invitations addressed to the signed-in user's email. Shown wherever the
 * user manages teams, so an invitation never depends on the link reaching
 * them. Renders nothing when there are none.
 */
export function MyInvitesPanel() {
  const { t } = useTranslation("openhands");
  const { data: invites } = useMyInvites();

  const accept = useTeamMutation(async (invite: MyInvite) => {
    const teamId = await teamRepository.respondToInvite(invite.id, true);
    await switchActiveTeam(teamId);
  });
  const decline = useTeamMutation((invite: MyInvite) =>
    teamRepository.respondToInvite(invite.id, false),
  );
  const isBusy = accept.isPending || decline.isPending;

  if (!invites || invites.length === 0) return null;

  return (
    <section
      data-testid="my-invites-panel"
      aria-label={t(I18nKey.TEAM$MY_INVITES_TITLE)}
      className={`${teamCardClassName} flex flex-col gap-3 border-[var(--primary-500)] p-4`}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
        <MailOpen size={16} className="text-[var(--primary-500)]" />
        {t(I18nKey.TEAM$MY_INVITES_TITLE)}
      </div>
      <ul className="flex flex-col gap-2">
        {invites.map((invite) => (
          <li
            key={invite.id}
            data-testid="my-invite-row"
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <span className="text-sm text-[var(--text-secondary)]">
              {invite.invitedByEmail
                ? t(I18nKey.TEAM$MY_INVITE_FROM, {
                    team: invite.teamName,
                    role: t(ROLE_LABEL_KEY[invite.role]),
                    inviter: invite.invitedByEmail,
                  })
                : t(I18nKey.TEAM$MY_INVITE, {
                    team: invite.teamName,
                    role: t(ROLE_LABEL_KEY[invite.role]),
                  })}
            </span>
            <span className="flex gap-2">
              <BrandButton
                testId="my-invite-decline"
                type="button"
                variant="secondary"
                isDisabled={isBusy}
                onClick={() => decline.mutate(invite)}
              >
                {t(I18nKey.TEAM$DECLINE)}
              </BrandButton>
              <BrandButton
                testId="my-invite-accept"
                type="button"
                variant="primary"
                isDisabled={isBusy}
                onClick={() => accept.mutate(invite)}
              >
                {t(I18nKey.TEAM$ACCEPT)}
              </BrandButton>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
