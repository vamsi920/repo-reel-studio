import { useState } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";

interface BrowserSnaphsotProps {
  src: string;
}

/**
 * Renders a browser-tool screenshot. Keyed by `src` in the parent so a new
 * screenshot always remounts with a clean slate — `onError` alone can't tell
 * "still loading" from "a previous frame's failure lingering after the src
 * changed" (see the equivalent `ImagePreview` in `file-content-viewer.tsx`).
 */
export function BrowserSnapshot({ src }: BrowserSnaphsotProps) {
  const { t } = useTranslation("openhands");
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className="flex w-full items-center justify-center py-8 text-sm text-[var(--oh-muted)]"
        data-testid="browser-snapshot-invalid"
      >
        {t(I18nKey.BROWSER$SCREENSHOT_INVALID)}
      </div>
    );
  }

  return (
    <img
      src={src}
      className="block w-full h-auto"
      alt={t(I18nKey.BROWSER$SCREENSHOT_ALT)}
      onError={() => setFailed(true)}
    />
  );
}
