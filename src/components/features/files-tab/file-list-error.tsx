import { CircleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ConversationTabEmptyState } from "#/components/features/conversation/conversation-tab-empty-state";
import { BrandButton } from "#/components/features/settings/brand-button";
import { I18nKey } from "#/i18n/declaration";

interface FileListErrorProps {
  onRetry: () => void;
}

/**
 * Shown in place of the quick row + tree when the workspace listing failed
 * and we have nothing older to fall back on. Deliberately distinct from the
 * "no files" / "no file selected" empty states: a broken workspace endpoint
 * must never look like an empty workspace.
 */
export function FileListErrorMessage({ onRetry }: FileListErrorProps) {
  const { t } = useTranslation("openhands");

  return (
    <div role="alert" className="h-full" data-testid="files-tab-list-error">
      <ConversationTabEmptyState
        className="h-full"
        icon={<CircleAlert aria-hidden strokeWidth={2} className="size-full" />}
        action={
          <BrandButton
            type="button"
            variant="secondary"
            onClick={onRetry}
            testId="files-tab-list-retry"
            className="min-w-32 justify-center px-6"
          >
            {t(I18nKey.FILES$RETRY)}
          </BrandButton>
        }
      >
        {t(I18nKey.FILES$LIST_LOAD_ERROR)}
      </ConversationTabEmptyState>
    </div>
  );
}

/**
 * Slim banner above the (still rendered) previous listing when a refresh
 * failed: the list the user sees may be out of date, and they get an
 * explicit way to try again.
 */
export function FileListStaleNotice({ onRetry }: FileListErrorProps) {
  const { t } = useTranslation("openhands");

  return (
    <div
      role="alert"
      data-testid="files-tab-list-stale"
      className="flex items-center gap-2 border-b border-[var(--oh-border)] bg-[var(--oh-surface-raised)] px-3 py-1.5 text-xs text-[var(--oh-text-tertiary)]"
    >
      <CircleAlert
        aria-hidden
        strokeWidth={2}
        className="size-3.5 shrink-0 text-[var(--oh-warning)]"
      />
      <span className="min-w-0 flex-1 truncate">
        {t(I18nKey.FILES$LIST_REFRESH_ERROR)}
      </span>
      <button
        type="button"
        onClick={onRetry}
        data-testid="files-tab-list-stale-retry"
        className="shrink-0 rounded-[7px] px-2 py-0.5 text-white hover:bg-[var(--oh-interactive-hover)] cursor-pointer"
      >
        {t(I18nKey.FILES$RETRY)}
      </button>
    </div>
  );
}
