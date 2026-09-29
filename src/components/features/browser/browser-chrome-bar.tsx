import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { copyTextToClipboard } from "#/utils/copy-text-to-clipboard";
import CopyIcon from "#/icons/copy.svg?react";
import CheckmarkIcon from "#/icons/checkmark.svg?react";

type BrowserChromeBarProps = {
  url: string;
  hasPage: boolean;
};

// The URL comes straight from the agent's browser actions. Only hand the
// browser an http(s) link; `javascript:`, `data:`, `file:` and the like must
// stay display-only text rather than become a clickable anchor.
export function isOpenableBrowserUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function BrowserChromeBar({ url, hasPage }: BrowserChromeBarProps) {
  const { t } = useTranslation("openhands");
  const [urlCopied, setUrlCopied] = useState(false);

  // Reset the "Copied" confirmation a couple of seconds after a successful
  // copy, mirroring the same timeout pattern used by SkillCard's copy button.
  useEffect(() => {
    if (!urlCopied) {
      return undefined;
    }
    const timeout = setTimeout(() => setUrlCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [urlCopied]);

  const handleCopyUrl = async () => {
    if (await copyTextToClipboard(url)) {
      setUrlCopied(true);
    }
  };

  const disabledButtonClassName = cn(
    "shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md",
    "text-[var(--oh-text-tertiary)] opacity-40 cursor-not-allowed",
  );

  const activeButtonClassName = cn(
    "shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md",
    "text-[var(--oh-text-tertiary)] hover:bg-tertiary cursor-pointer",
  );

  const iconClassName = "w-3.5 h-3.5";

  return (
    <div
      className="flex w-full min-h-[34px] shrink-0 items-center gap-1 border-b border-[var(--oh-border)] px-2 py-1.5"
      data-testid="browser-chrome-bar"
    >
      <div
        className={cn(
          "flex min-h-7 min-w-0 flex-1 items-center rounded-md border border-[var(--oh-border)]",
          "bg-[var(--oh-surface-raised)] px-2 text-xs leading-5",
          url ? "text-[var(--oh-text-tertiary)]" : "text-[var(--oh-text-dim)]",
        )}
        data-testid="browser-chrome-url"
        title={url || undefined}
      >
        <span className="truncate">
          {url || t(I18nKey.BROWSER$URL_PLACEHOLDER)}
        </span>
      </div>

      {url ? (
        <button
          type="button"
          disabled={urlCopied}
          onClick={handleCopyUrl}
          aria-label={t(
            urlCopied ? I18nKey.BUTTON$COPIED : I18nKey.BUTTON$COPY,
          )}
          title={t(urlCopied ? I18nKey.BUTTON$COPIED : I18nKey.BUTTON$COPY)}
          data-testid="browser-chrome-copy-url"
          className={cn(activeButtonClassName, urlCopied && "cursor-default")}
        >
          {urlCopied ? (
            // checkmark.svg hardcodes fill="white"; force currentColor so it
            // matches the toolbar's muted icon color instead of always white.
            <CheckmarkIcon
              className={cn(iconClassName, "[&_path]:fill-current")}
              aria-hidden
            />
          ) : (
            <CopyIcon className={iconClassName} aria-hidden />
          )}
        </button>
      ) : (
        <button
          type="button"
          disabled
          aria-label={t(I18nKey.BUTTON$COPY)}
          title={t(I18nKey.BUTTON$COPY)}
          className={disabledButtonClassName}
        >
          <CopyIcon className={iconClassName} aria-hidden />
        </button>
      )}

      {hasPage && isOpenableBrowserUrl(url) ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t(I18nKey.BUTTON$OPEN_IN_NEW_TAB)}
          title={t(I18nKey.BUTTON$OPEN_IN_NEW_TAB)}
          data-testid="browser-chrome-open-external"
          className={activeButtonClassName}
        >
          <ExternalLink className={iconClassName} aria-hidden strokeWidth={2} />
        </a>
      ) : (
        <button
          type="button"
          disabled
          aria-label={t(I18nKey.BUTTON$OPEN_IN_NEW_TAB)}
          title={t(I18nKey.BUTTON$OPEN_IN_NEW_TAB)}
          className={disabledButtonClassName}
        >
          <ExternalLink className={iconClassName} aria-hidden strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
