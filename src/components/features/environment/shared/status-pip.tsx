import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import type { CapabilityStatus } from "#/lib/environment/types/requirements";
import {
  CAPABILITY_STATUS_LABEL_KEY,
  pipClassForCapabilityStatus,
} from "#/lib/environment/display";

export interface StatusPipProps {
  status: CapabilityStatus;
  /** Adds the pulsing `.ame-pip.live` treatment while a probe is in flight. */
  live?: boolean;
  showLabel?: boolean;
  className?: string;
  testId?: string;
}

/**
 * The one place a capability's state becomes a colour. Three failure states
 * are deliberately distinct -- "not configured", "configured but failing" and
 * "working but limited" need different reactions from whoever is onboarding.
 */
export function StatusPip({
  status,
  live = false,
  showLabel = true,
  className,
  testId = "environment-status-pip",
}: StatusPipProps) {
  const { t } = useTranslation("openhands");
  const label = t(
    CAPABILITY_STATUS_LABEL_KEY[status] ?? I18nKey.ENVIRONMENT$STATUS_UNKNOWN,
  );

  return (
    <span
      role="status"
      data-testid={testId}
      data-status={status}
      className={cn("inline-flex items-center gap-2 text-xs", className)}
    >
      <span
        aria-hidden
        className={cn(
          pipClassForCapabilityStatus(status),
          live && "live",
          "motion-reduce:animate-none",
        )}
      />
      {showLabel ? (
        <span className="text-[var(--text-secondary)]">{label}</span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </span>
  );
}
