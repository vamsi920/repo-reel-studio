import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { ModalCloseButton } from "#/components/shared/modals/modal-close-button";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { modalTitleLgClassName } from "#/utils/modal-classes";
import { CreateInstructionsContent } from "./create-instructions";
import { CreateAutomationForm } from "./create-automation-form";

interface AddAutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddAutomationModal({
  isOpen,
  onClose,
}: AddAutomationModalProps) {
  const { t } = useTranslation("openhands");
  // The modal used to only explain how to ask an agent to build an automation,
  // which left "Add Automation" as a dead end. The form is now the primary
  // path; describing it in a conversation stays available underneath.
  const [showChatInstructions, setShowChatInstructions] = useState(false);

  if (!isOpen) return null;

  return (
    <ModalBackdrop
      onClose={onClose}
      aria-label={t(I18nKey.AUTOMATIONS$EMPTY_HOW_TO_CREATE_TITLE)}
    >
      <div
        data-testid="add-automation-modal"
        className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[var(--oh-border)] bg-base-secondary"
      >
        <ModalCloseButton
          onClose={onClose}
          testId="add-automation-modal-close"
        />
        <header className="flex-shrink-0 px-6 pb-4 pt-6">
          <h2
            id="add-automation-modal-title"
            className={cn("pr-6", modalTitleLgClassName)}
          >
            {showChatInstructions
              ? t(I18nKey.AUTOMATIONS$EMPTY_HOW_TO_CREATE_TITLE)
              : t(I18nKey.AUTOMATIONS$CREATE_TITLE)}
          </h2>
        </header>
        <div className="overflow-y-auto px-6 pb-6">
          {showChatInstructions ? (
            <CreateInstructionsContent onLaunch={onClose} />
          ) : (
            <>
              <CreateAutomationForm onCreated={onClose} onCancel={onClose} />
              <button
                type="button"
                data-testid="add-automation-use-chat"
                onClick={() => setShowChatInstructions(true)}
                className="mt-4 text-xs text-muted underline hover:text-content"
              >
                {t(I18nKey.AUTOMATIONS$CREATE_FROM_CHAT)}
              </button>
            </>
          )}
        </div>
      </div>
    </ModalBackdrop>
  );
}
