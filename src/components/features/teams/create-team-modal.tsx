import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { BrandButton } from "#/components/features/settings/brand-button";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { teamRepository } from "#/lib/data-platform/repositories/team-repository";
import { teamErrorMessageKey } from "#/lib/teams/errors";
import { switchActiveTeam } from "#/hooks/query/use-teams";
import { teamFieldClassName, teamMutedTextClassName } from "./team-labels";

const NAME_MIN = 2;
const NAME_MAX = 60;

interface CreateTeamModalProps {
  onClose: () => void;
}

/** Creates a team and moves the app into it. */
export function CreateTeamModal({ onClose }: CreateTeamModalProps) {
  const { t } = useTranslation("openhands");
  const [name, setName] = React.useState("");
  const [isBusy, setIsBusy] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<I18nKey | null>(null);

  const trimmed = name.trim().replace(/\s+/g, " ");
  const isValid = trimmed.length >= NAME_MIN && trimmed.length <= NAME_MAX;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValid || isBusy) return;
    setIsBusy(true);
    setErrorKey(null);
    try {
      const teamId = await teamRepository.createTeam(trimmed);
      await switchActiveTeam(teamId);
    } catch (error) {
      setErrorKey(teamErrorMessageKey(error));
      setIsBusy(false);
    }
  };

  return (
    <ModalBackdrop
      onClose={isBusy ? undefined : onClose}
      closeOnEscape={!isBusy}
      aria-label={t(I18nKey.TEAM$CREATE_TITLE)}
    >
      <form
        data-testid="create-team-modal"
        onSubmit={handleSubmit}
        className="bg-base-secondary flex w-[440px] max-w-[90vw] flex-col gap-4 rounded-xl border border-[var(--oh-border)] p-5"
      >
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            {t(I18nKey.TEAM$CREATE_TITLE)}
          </h2>
          <p className={teamMutedTextClassName}>
            {t(I18nKey.TEAM$CREATE_SUBTITLE)}
          </p>
        </div>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-[var(--text-secondary)]">
            {t(I18nKey.TEAM$NAME_LABEL)}
          </span>
          <input
            data-testid="create-team-name"
            className={teamFieldClassName}
            value={name}
            maxLength={NAME_MAX}
            autoComplete="off"
            placeholder={t(I18nKey.TEAM$NAME_PLACEHOLDER)}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {errorKey ? (
          <p role="alert" className="text-sm text-red-500">
            {t(errorKey)}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <BrandButton
            testId="create-team-cancel"
            type="button"
            variant="secondary"
            isDisabled={isBusy}
            onClick={onClose}
          >
            {t(I18nKey.BUTTON$CANCEL)}
          </BrandButton>
          <BrandButton
            testId="create-team-submit"
            type="submit"
            variant="primary"
            isDisabled={!isValid || isBusy}
            aria-busy={isBusy}
          >
            {t(I18nKey.TEAM$CREATE_SUBMIT)}
          </BrandButton>
        </div>
      </form>
    </ModalBackdrop>
  );
}
