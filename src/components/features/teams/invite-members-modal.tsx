import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { BrandButton } from "#/components/features/settings/brand-button";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { teamRepository } from "#/lib/data-platform/repositories/team-repository";
import { useTeamMutation } from "#/hooks/query/use-teams";
import {
  MAX_INVITE_EMAILS,
  buildInviteLink,
  parseInviteEmails,
} from "#/lib/teams/invites";
import { INVITE_ROLES } from "#/lib/teams/types";
import type { InviteOutcome, InviteRole } from "#/lib/teams/types";
import { CopyLinkField } from "./copy-link-field";
import { RoleSelect } from "./role-select";
import {
  INVITE_OUTCOME_LABEL_KEY,
  ROLE_HINT_KEY,
  teamFieldClassName,
  teamMutedTextClassName,
} from "./team-labels";

interface InviteMembersModalProps {
  teamId: string;
  teamName: string;
  onClose: () => void;
}

/**
 * Invites people by email. This deployment sends no email, so the result
 * screen hands the inviter a link per person to pass on; the invited person
 * also finds the invitation waiting in the app once they sign in with that
 * address.
 */
export function InviteMembersModal({
  teamId,
  teamName,
  onClose,
}: InviteMembersModalProps) {
  const { t } = useTranslation("openhands");
  const [raw, setRaw] = React.useState("");
  const [role, setRole] = React.useState<InviteRole>("member");
  const [outcomes, setOutcomes] = React.useState<InviteOutcome[] | null>(null);

  const parsed = React.useMemo(() => parseInviteEmails(raw), [raw]);
  const tooMany = parsed.valid.length > MAX_INVITE_EMAILS;
  const canSubmit =
    parsed.valid.length > 0 && parsed.invalid.length === 0 && !tooMany;

  const invite = useTeamMutation(() =>
    teamRepository.createInvites(teamId, parsed.valid, role),
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || invite.isPending) return;
    invite.mutate(undefined, { onSuccess: setOutcomes });
  };

  const title = t(I18nKey.TEAM$INVITE_TITLE, { team: teamName });

  return (
    <ModalBackdrop
      onClose={invite.isPending ? undefined : onClose}
      closeOnEscape={!invite.isPending}
      aria-label={title}
    >
      <div
        data-testid="invite-members-modal"
        className="bg-base-secondary flex max-h-[85vh] w-[560px] max-w-[92vw] flex-col gap-4 overflow-y-auto rounded-xl border border-[var(--oh-border)] p-5"
      >
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            {title}
          </h2>
          <p className={teamMutedTextClassName}>
            {outcomes
              ? t(I18nKey.TEAM$INVITE_RESULT_SUBTITLE)
              : t(I18nKey.TEAM$INVITE_SUBTITLE)}
          </p>
        </div>

        {outcomes ? (
          <>
            <ul data-testid="invite-outcomes" className="flex flex-col gap-3">
              {outcomes.map((outcome) => (
                <li
                  key={outcome.email}
                  data-testid={`invite-outcome-${outcome.status}`}
                  className="flex flex-col gap-1.5 rounded-lg border border-[var(--oh-border)] p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="break-all text-[var(--text-primary)]">
                      {outcome.email}
                    </span>
                    <span
                      className={
                        outcome.token
                          ? "text-[var(--primary-500)]"
                          : "text-[var(--text-secondary)]"
                      }
                    >
                      {t(INVITE_OUTCOME_LABEL_KEY[outcome.status])}
                    </span>
                  </div>
                  {outcome.token ? (
                    <CopyLinkField
                      testId="invite-link"
                      label={t(I18nKey.TEAM$INVITE_LINK_FOR, {
                        email: outcome.email,
                      })}
                      link={buildInviteLink(outcome.token)}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <BrandButton
                testId="invite-done"
                type="button"
                variant="primary"
                onClick={onClose}
              >
                {t(I18nKey.TEAM$DONE)}
              </BrandButton>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-[var(--text-secondary)]">
                {t(I18nKey.TEAM$INVITE_EMAILS_LABEL)}
              </span>
              <textarea
                data-testid="invite-emails"
                rows={4}
                className={teamFieldClassName}
                value={raw}
                placeholder={t(I18nKey.TEAM$INVITE_EMAILS_PLACEHOLDER)}
                onChange={(event) => setRaw(event.target.value)}
              />
            </label>
            {parsed.invalid.length > 0 ? (
              <p
                role="alert"
                data-testid="invite-invalid"
                className="text-sm text-red-500"
              >
                {t(I18nKey.TEAM$INVITE_INVALID_EMAILS, {
                  emails: parsed.invalid.join(", "),
                })}
              </p>
            ) : null}
            {tooMany ? (
              <p role="alert" className="text-sm text-red-500">
                {t(I18nKey.TEAM$ERROR_TOO_MANY_EMAILS)}
              </p>
            ) : null}
            <div className="flex flex-col gap-1.5 text-sm">
              <span className="text-[var(--text-secondary)]">
                {t(I18nKey.TEAM$ROLE_LABEL)}
              </span>
              <RoleSelect
                testId="invite-role"
                ariaLabel={t(I18nKey.TEAM$ROLE_LABEL)}
                value={role}
                options={INVITE_ROLES}
                onChange={setRole}
                className="w-full"
              />
              <span className={teamMutedTextClassName}>
                {t(ROLE_HINT_KEY[role])}
              </span>
            </div>
            <div className="flex justify-end gap-2">
              <BrandButton
                testId="invite-cancel"
                type="button"
                variant="secondary"
                isDisabled={invite.isPending}
                onClick={onClose}
              >
                {t(I18nKey.BUTTON$CANCEL)}
              </BrandButton>
              <BrandButton
                testId="invite-submit"
                type="submit"
                variant="primary"
                isDisabled={!canSubmit || invite.isPending}
                aria-busy={invite.isPending}
              >
                {t(I18nKey.TEAM$INVITE_SUBMIT, { count: parsed.valid.length })}
              </BrandButton>
            </div>
          </form>
        )}
      </div>
    </ModalBackdrop>
  );
}
