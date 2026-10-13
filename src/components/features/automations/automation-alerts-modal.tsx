import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { ModalCloseButton } from "#/components/shared/modals/modal-close-button";
import { modalTitleLgMediumClassName } from "#/utils/modal-classes";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { BrandButton } from "#/components/features/settings/brand-button";
import { ToggleSwitch } from "#/components/features/automations/toggle-switch";
import {
  useAutomationPolicies,
  useSaveAutomationAlerts,
} from "#/hooks/query/use-automation-policies";
import type { AutomationAlertMode } from "#/api/automation-policy-service";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { cn } from "#/utils/utils";

const MODES: { value: AutomationAlertMode; label: I18nKey }[] = [
  { value: "failures", label: I18nKey.AUTOMATIONS$ALERTS$WHEN_FAILURES },
  { value: "all", label: I18nKey.AUTOMATIONS$ALERTS$WHEN_ALL },
  { value: "off", label: I18nKey.AUTOMATIONS$ALERTS$WHEN_OFF },
];

/** Example URL, not copy: webhook URLs are the same in every language. */
const WEBHOOK_PLACEHOLDER = "https://hooks.slack.com/services/…";

interface AutomationAlertsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Where failed automation runs are reported. Sent by the local automation
 * guard (scripts/automation-guard.mjs), so alerts arrive with the app closed.
 * Benchmarked against Devin, which emails the owner on failure; here a
 * desktop notification and/or a Slack, Discord or any https webhook.
 */
export function AutomationAlertsModal({
  isOpen,
  onClose,
}: AutomationAlertsModalProps) {
  const { t } = useTranslation("openhands");
  const { data } = useAutomationPolicies();
  const saveMutation = useSaveAutomationAlerts();
  const alerts = data?.policies.alerts;

  const [mode, setMode] = useState<AutomationAlertMode>("failures");
  const [desktop, setDesktop] = useState(true);
  const [webhook, setWebhook] = useState("");
  const [webhookError, setWebhookError] = useState<string | null>(null);

  const loaded = data !== undefined;
  useEffect(() => {
    if (!isOpen || !loaded) return;
    setMode(alerts?.on ?? "failures");
    setDesktop(alerts?.desktop !== false);
    setWebhook(alerts?.webhook_url ?? "");
    setWebhookError(null);
  }, [isOpen, loaded]);

  if (!isOpen) return null;

  const handleSave = () => {
    const url = webhook.trim();
    if (url && !/^https:\/\/\S+$/.test(url)) {
      setWebhookError(t(I18nKey.AUTOMATIONS$ALERTS$INVALID_WEBHOOK));
      return;
    }
    saveMutation.mutate(
      { on: mode, desktop, webhook_url: url },
      {
        onSuccess: () => {
          displaySuccessToast(t(I18nKey.AUTOMATIONS$ALERTS$SAVED));
          onClose();
        },
        onError: () => displayErrorToast(t(I18nKey.ERROR$GENERIC)),
      },
    );
  };

  return (
    <ModalBackdrop
      onClose={onClose}
      aria-label={t(I18nKey.AUTOMATIONS$ALERTS$TITLE)}
    >
      <div
        data-testid="automation-alerts-modal"
        className="relative flex w-full max-w-md flex-col gap-5 rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)] p-6"
      >
        <ModalCloseButton onClose={onClose} testId="automation-alerts-close" />
        <div>
          <h2 className={modalTitleLgMediumClassName}>
            {t(I18nKey.AUTOMATIONS$ALERTS$TITLE)}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {t(I18nKey.AUTOMATIONS$ALERTS$DESCRIPTION)}
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm">
            {t(I18nKey.AUTOMATIONS$ALERTS$WHEN_LABEL)}
          </legend>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {MODES.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={mode === option.value}
                data-testid={`automation-alerts-mode-${option.value}`}
                onClick={() => setMode(option.value)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm",
                  mode === option.value
                    ? "border-white bg-white text-base-secondary"
                    : "border-[var(--oh-border)] text-content hover:bg-surface-raised",
                )}
              >
                {t(option.label)}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-content">
            {t(I18nKey.AUTOMATIONS$ALERTS$DESKTOP)}
          </span>
          <ToggleSwitch
            enabled={desktop}
            label={t(I18nKey.AUTOMATIONS$ALERTS$DESKTOP)}
            onToggle={() => setDesktop((value) => !value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <SettingsInput
            testId="automation-alerts-webhook"
            name="webhook_url"
            type="url"
            label={t(I18nKey.AUTOMATIONS$ALERTS$WEBHOOK_LABEL)}
            value={webhook}
            onChange={setWebhook}
            error={webhookError ?? undefined}
            showOptionalTag
            placeholder={WEBHOOK_PLACEHOLDER}
          />
          <p className="text-xs text-muted">
            {t(I18nKey.AUTOMATIONS$ALERTS$WEBHOOK_HINT)}
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <BrandButton type="button" variant="secondary" onClick={onClose}>
            {t(I18nKey.BUTTON$CANCEL)}
          </BrandButton>
          <BrandButton
            testId="automation-alerts-save"
            type="button"
            variant="primary"
            onClick={handleSave}
            isDisabled={saveMutation.isPending}
          >
            {t(I18nKey.BUTTON$SAVE)}
          </BrandButton>
        </div>
      </div>
    </ModalBackdrop>
  );
}
