import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

interface UnsupportedTriggerBadgeProps {
  className?: string;
}

/**
 * Flags that this automation's event trigger has no backend receiver, so it
 * will show as "Active" and never actually run. Independent of
 * `AutomationHealthBadge`'s manifest-driven health system so it still shows
 * up wherever an automation is rendered without dashboard insights.
 */
export function UnsupportedTriggerBadge({
  className,
}: UnsupportedTriggerBadgeProps) {
  const { t } = useTranslation("openhands");

  return (
    <span
      data-testid="unsupported-trigger-badge"
      title={t(I18nKey.AUTOMATIONS$UNSUPPORTED_TRIGGER_WARNING)}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium",
        "border-[var(--oh-warning)]/50 bg-[var(--oh-warning)]/10 text-[var(--oh-warning)]",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {t(I18nKey.AUTOMATIONS$UNSUPPORTED_TRIGGER_BADGE)}
    </span>
  );
}
