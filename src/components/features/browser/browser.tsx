import { BrowserSnapshot } from "./browser-snapshot";
import { BrowserChromeBar } from "./browser-chrome-bar";
import { EmptyBrowserMessage } from "./empty-browser-message";
import { useBrowserStore } from "#/stores/browser-store";

export function BrowserPanel() {
  const url = useBrowserStore((state) => state.url);
  const screenshotSrc = useBrowserStore((state) => state.screenshotSrc);
  const hasPage = Boolean(screenshotSrc);

  // Screenshots arrive either as a complete data URL (any image type — the
  // legacy `extras.screenshot` path is not normalised) or as bare base64,
  // which we assume is PNG. Only bare payloads get the prefix; matching on
  // `data:image/png;` alone double-prefixed JPEG/WebP data URLs into a broken
  // image.
  const imgSrc = screenshotSrc.startsWith("data:")
    ? screenshotSrc
    : `data:image/png;base64,${screenshotSrc}`;

  return (
    <div className="flex h-full min-h-0 w-full flex-col text-[var(--oh-muted)]">
      <BrowserChromeBar url={url} hasPage={hasPage} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-hide bg-[var(--oh-surface)]">
        {screenshotSrc ? (
          <BrowserSnapshot src={imgSrc} />
        ) : (
          <EmptyBrowserMessage />
        )}
      </div>
    </div>
  );
}
