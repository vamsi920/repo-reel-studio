import React from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { teamFieldClassName } from "./team-labels";

interface CopyLinkFieldProps {
  link: string;
  /** Who the link is for, read out with the field. */
  label: string;
  testId?: string;
}

/**
 * An invitation link with a copy button. The link stays visible and
 * selectable, so it can still be copied by hand where the clipboard is
 * blocked (an insecure origin, a locked-down browser).
 */
export function CopyLinkField({ link, label, testId }: CopyLinkFieldProps) {
  const { t } = useTranslation("openhands");
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        readOnly
        data-testid={testId}
        aria-label={label}
        value={link}
        onFocus={(event) => event.target.select()}
        className={cn(teamFieldClassName, "font-mono text-xs")}
      />
      <button
        type="button"
        data-testid={testId ? `${testId}-copy` : undefined}
        onClick={handleCopy}
        aria-label={t(I18nKey.TEAM$COPY_LINK)}
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--oh-border)] px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--oh-interactive-hover)]"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? t(I18nKey.TEAM$COPIED) : t(I18nKey.TEAM$COPY_LINK)}
      </button>
    </div>
  );
}
