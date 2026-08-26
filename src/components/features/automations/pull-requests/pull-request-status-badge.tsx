import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import type { NeodevexPullRequestState } from "#/api/git-service/local-github-service.api";

const STATUS_STYLES: Record<NeodevexPullRequestState, string> = {
  open: "border-[var(--oh-success)]/50 bg-[var(--oh-success)]/10 text-[var(--oh-success)]",
  merged:
    "border-[var(--oh-primary,theme(colors.purple.500))]/50 bg-[var(--oh-primary,theme(colors.purple.500))]/10 text-[var(--oh-primary,theme(colors.purple.400))]",
  closed: "border-[var(--oh-border)] bg-surface-raised text-muted",
};

const STATUS_LABEL_KEYS: Record<NeodevexPullRequestState, I18nKey> = {
  open: I18nKey.AUTOMATIONS$PULL_REQUESTS$STATUS_OPEN,
  merged: I18nKey.AUTOMATIONS$PULL_REQUESTS$STATUS_MERGED,
  closed: I18nKey.AUTOMATIONS$PULL_REQUESTS$STATUS_CLOSED,
};

interface PullRequestStatusBadgeProps {
  state: NeodevexPullRequestState;
  isDraft?: boolean;
}

export function PullRequestStatusBadge({
  state,
  isDraft,
}: PullRequestStatusBadgeProps) {
  const { t } = useTranslation("openhands");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium",
        STATUS_STYLES[state],
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {isDraft && state === "open"
        ? t(I18nKey.AUTOMATIONS$PULL_REQUESTS$STATUS_DRAFT)
        : t(STATUS_LABEL_KEYS[state])}
    </span>
  );
}
