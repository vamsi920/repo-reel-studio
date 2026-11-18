import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { BrandButton } from "#/components/features/settings/brand-button";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { teamFieldClassName, teamMutedTextClassName } from "./team-labels";

interface TeamConfirmDialogProps {
  testId: string;
  title: string;
  body: string;
  confirmLabel: string;
  /** Styles the confirm button as destructive. */
  isDanger?: boolean;
  /**
   * When set, the confirm button stays disabled until the user types exactly
   * this text. For actions that cannot be undone.
   */
  requireText?: string;
  requireTextLabel?: string;
  isBusy?: boolean;
  onConfirm: (typedText: string) => void;
  onCancel: () => void;
}

export function TeamConfirmDialog({
  testId,
  title,
  body,
  confirmLabel,
  isDanger = false,
  requireText,
  requireTextLabel,
  isBusy = false,
  onConfirm,
  onCancel,
}: TeamConfirmDialogProps) {
  const { t } = useTranslation("openhands");
  const [typed, setTyped] = React.useState("");
  const blocked = requireText !== undefined && typed.trim() !== requireText;

  return (
    <ModalBackdrop
      onClose={isBusy ? undefined : onCancel}
      closeOnEscape={!isBusy}
      aria-label={title}
    >
      <form
        data-testid={testId}
        className="bg-base-secondary flex w-[440px] max-w-[90vw] flex-col gap-4 rounded-xl border border-[var(--oh-border)] p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!blocked && !isBusy) onConfirm(typed.trim());
        }}
      >
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          {title}
        </h2>
        <p className={teamMutedTextClassName}>{body}</p>
        {requireText !== undefined ? (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--text-secondary)]">
              {requireTextLabel}
            </span>
            <input
              data-testid={`${testId}-input`}
              className={teamFieldClassName}
              value={typed}
              autoComplete="off"
              onChange={(event) => setTyped(event.target.value)}
            />
          </label>
        ) : null}
        <div className="flex justify-end gap-2">
          <BrandButton
            testId={`${testId}-cancel`}
            type="button"
            variant="secondary"
            isDisabled={isBusy}
            onClick={onCancel}
          >
            {t(I18nKey.BUTTON$CANCEL)}
          </BrandButton>
          <BrandButton
            testId={`${testId}-confirm`}
            type="submit"
            variant={isDanger ? "danger" : "primary"}
            isDisabled={blocked || isBusy}
            aria-busy={isBusy}
          >
            {confirmLabel}
          </BrandButton>
        </div>
      </form>
    </ModalBackdrop>
  );
}
