import React from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { MailOpen } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { BrandButton } from "#/components/features/settings/brand-button";
import { isSupabaseConfigured } from "#/lib/data-platform/client";
import { teamRepository } from "#/lib/data-platform/repositories/team-repository";
import { signOutAndRedirect } from "#/lib/data-platform/auth-flow";
import { rememberPostLoginPath } from "#/lib/teams/invites";
import { useSupabaseSession } from "#/hooks/query/use-supabase-session";
import {
  switchActiveTeam,
  useInvitePreview,
  useTeamMutation,
} from "#/hooks/query/use-teams";
import {
  INVITE_STATUS_LABEL_KEY,
  ROLE_HINT_KEY,
  ROLE_LABEL_KEY,
  teamCardClassName,
  teamMutedTextClassName,
} from "#/components/features/teams/team-labels";

const TEAM_PATH = "/team";

/**
 * Where an invitation link lands. Shows which team is inviting, as what role
 * and to which address, and lets the invited person accept or decline.
 *
 * An invitation belongs to one email address. Someone signed in as anyone
 * else is told so, and offered a way to switch accounts that brings them
 * straight back here.
 */
export default function InviteRoute() {
  const { t } = useTranslation("openhands");
  const navigate = useNavigate();
  const { token } = useParams<{ token: string }>();
  const { status, user } = useSupabaseSession();
  const isSignedIn = isSupabaseConfigured && status === "real";
  const { data: invite, isPending, isError } = useInvitePreview(token);

  const accept = useTeamMutation(async () => {
    const teamId = await teamRepository.acceptInvite(token as string);
    await switchActiveTeam(teamId);
  });
  const isBusy = accept.isPending;

  const handleSwitchAccount = async () => {
    rememberPostLoginPath(window.location.pathname);
    await signOutAndRedirect(navigate);
  };

  const handleOpenTeam = async () => {
    if (invite?.teamId) await switchActiveTeam(invite.teamId);
  };

  let content: React.ReactNode;
  if (!isSignedIn && status !== "loading") {
    // No account to match the invitation against (sign-in is not set up on
    // this install, or the session ended while the page was open).
    content = (
      <p data-testid="invite-unavailable" className={teamMutedTextClassName}>
        {t(I18nKey.TEAM$ERROR_NOT_CONFIGURED)}
      </p>
    );
  } else if (isPending) {
    content = (
      <p className={teamMutedTextClassName}>{t(I18nKey.TEAM$LOADING)}</p>
    );
  } else if (isError || !invite || invite.status === "not_found") {
    content = (
      <p data-testid="invite-not-found" className={teamMutedTextClassName}>
        {t(I18nKey.TEAM$ERROR_INVITE_NOT_FOUND)}
      </p>
    );
  } else if (invite.alreadyMember) {
    content = (
      <>
        <p
          data-testid="invite-already-member"
          className={teamMutedTextClassName}
        >
          {t(I18nKey.TEAM$INVITE_ALREADY_MEMBER, { team: invite.teamName })}
        </p>
        <div>
          <BrandButton
            testId="invite-open-team"
            type="button"
            variant="primary"
            onClick={handleOpenTeam}
          >
            {t(I18nKey.TEAM$INVITE_OPEN_TEAM)}
          </BrandButton>
        </div>
      </>
    );
  } else if (invite.status !== "pending") {
    content = (
      <p data-testid="invite-closed" className={teamMutedTextClassName}>
        {t(I18nKey.TEAM$INVITE_CLOSED, {
          team: invite.teamName,
          status: t(INVITE_STATUS_LABEL_KEY[invite.status]),
        })}
      </p>
    );
  } else if (!invite.emailMatches) {
    content = (
      <>
        <p
          role="alert"
          data-testid="invite-email-mismatch"
          className={teamMutedTextClassName}
        >
          {t(I18nKey.TEAM$INVITE_WRONG_ACCOUNT, {
            invited: invite.email,
            current: user?.email ?? "",
          })}
        </p>
        <div>
          <BrandButton
            testId="invite-switch-account"
            type="button"
            variant="primary"
            onClick={handleSwitchAccount}
          >
            {t(I18nKey.TEAM$INVITE_SWITCH_ACCOUNT)}
          </BrandButton>
        </div>
      </>
    );
  } else {
    content = (
      <>
        <p className={teamMutedTextClassName}>
          {invite.invitedByEmail
            ? t(I18nKey.TEAM$MY_INVITE_FROM, {
                team: invite.teamName,
                role: invite.role ? t(ROLE_LABEL_KEY[invite.role]) : "",
                inviter: invite.invitedByEmail,
              })
            : t(I18nKey.TEAM$MY_INVITE, {
                team: invite.teamName,
                role: invite.role ? t(ROLE_LABEL_KEY[invite.role]) : "",
              })}
        </p>
        {invite.role ? (
          <p className="text-xs text-[var(--text-secondary)]">
            {t(ROLE_HINT_KEY[invite.role])}
          </p>
        ) : null}
        <div className="flex gap-2">
          <BrandButton
            testId="invite-accept"
            type="button"
            variant="primary"
            isDisabled={isBusy}
            aria-busy={isBusy}
            onClick={() => accept.mutate(undefined)}
          >
            {t(I18nKey.TEAM$INVITE_ACCEPT_AND_OPEN)}
          </BrandButton>
          <BrandButton
            testId="invite-later"
            type="button"
            variant="secondary"
            isDisabled={isBusy}
            onClick={() => navigate(TEAM_PATH)}
          >
            {t(I18nKey.TEAM$INVITE_LATER)}
          </BrandButton>
        </div>
      </>
    );
  }

  return (
    <main
      data-testid="invite-screen"
      className="flex h-full min-h-0 items-start justify-center overflow-y-auto p-4 md:p-10"
    >
      <section
        className={`${teamCardClassName} flex w-full max-w-lg flex-col gap-4 p-6`}
      >
        <div className="flex items-center gap-2">
          <MailOpen size={20} className="text-[var(--primary-500)]" />
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">
            {invite?.teamName
              ? t(I18nKey.TEAM$INVITE_PAGE_TITLE, { team: invite.teamName })
              : t(I18nKey.TEAM$INVITE_PAGE_TITLE_GENERIC)}
          </h1>
        </div>
        {content}
      </section>
    </main>
  );
}
