import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { ModalCloseButton } from "#/components/shared/modals/modal-close-button";
import { modalTitleLgMediumClassName } from "#/utils/modal-classes";

interface DeleteConfirmationModalProps {
  automationName: string;
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmationModal({
  automationName,
  isOpen,
  onConfirm,
  onCancel,
}: DeleteConfirmationModalProps) {
  const { t } = useTranslation("openhands");

  if (!isOpen) return null;

  return (
    <ModalBackdrop
      onClose={onCancel}
      aria-label={t(I18nKey.AUTOMATIONS$DELETE_CONFIRM_TITLE)}
    >
      <div className="relative w-full max-w-sm rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)] p-6">
        <ModalCloseButton onClose={onCancel} testId="delete-automation-close" />

        <h2 className={modalTitleLgMediumClassName}>
          {t(I18nKey.AUTOMATIONS$DELETE_CONFIRM_TITLE)}
        </h2>
        <p className="mt-2 text-sm text-muted">
          {t(I18nKey.AUTOMATIONS$DELETE_CONFIRM_MESSAGE, {
            name: automationName,
          })}
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[var(--oh-border)] px-4 py-2 text-sm text-white hover:bg-surface-raised"
          >
            {t(I18nKey.AUTOMATIONS$CANCEL)}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-danger px-4 py-2 text-sm text-white hover:bg-danger/80"
          >
            {t(I18nKey.AUTOMATIONS$DELETE)}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
