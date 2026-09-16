import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";

import { I18nKey } from "#/i18n/declaration";

interface FileListTruncatedNoticeProps {
  /** How many files the quick row / tree actually list. */
  shown: number;
  /** How many files the workspace really holds. */
  total: number;
}

/**
 * Slim banner above the listing when the workspace holds more files than we
 * render. The cut must never be silent: without it a capped list is
 * indistinguishable from the whole workspace, and the files past the cap
 * look as if they don't exist.
 */
export function FileListTruncatedNotice({
  shown,
  total,
}: FileListTruncatedNoticeProps) {
  const { t, i18n } = useTranslation("openhands");
  const format = (n: number) => n.toLocaleString(i18n.language);

  return (
    <div
      role="status"
      data-testid="files-tab-list-truncated"
      className="flex items-center gap-2 border-b border-[var(--oh-border)] bg-[var(--oh-surface-raised)] px-3 py-1.5 text-xs text-[var(--oh-text-tertiary)]"
    >
      <Info aria-hidden strokeWidth={2} className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        {t(I18nKey.FILES$LIST_TRUNCATED, {
          shown: format(shown),
          total: format(total),
        })}
      </span>
    </div>
  );
}
