import { useTranslation } from "react-i18next";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

import { SyntaxHighlighter } from "#/components/features/markdown/syntax-highlighter";
import { I18nKey } from "#/i18n/declaration";
import { getPrismLanguageForFile } from "#/utils/file-language";

interface HighlightedSourceViewProps {
  path: string;
  text: string;
  mimeType?: string;
}

/**
 * Hard ceiling above which we never hand a file to Prism. The highlighter
 * builds one span per token plus one row per line on the main thread, so a
 * 450 KB / 20,000-line file already costs ~3.5 s of frozen UI and a 5 MB
 * JSON file hangs the tab for minutes. Past either limit the file is shown
 * in the plain `<pre>` path, which renders multi-megabyte text instantly.
 */
export const MAX_HIGHLIGHT_BYTES = 300_000;
export const MAX_HIGHLIGHT_LINES = 5_000;

/**
 * Cheap "is this too big to highlight?" check: the byte test is O(1), and
 * the line count stops at the ceiling instead of scanning the whole file.
 */
export function isTooLargeToHighlight(text: string): boolean {
  if (text.length > MAX_HIGHLIGHT_BYTES) return true;
  let lines = 1;
  let index = text.indexOf("\n");
  while (index !== -1) {
    lines += 1;
    if (lines > MAX_HIGHLIGHT_LINES) return true;
    index = text.indexOf("\n", index + 1);
  }
  return false;
}

/**
 * Renders the raw bytes of a workspace text file with Prism syntax
 * highlighting. Used both in:
 *   - Rich mode for actual source files (.ts, .py, .yaml, …) — there is
 *     no "rich" rendering of source code, so highlighted source IS the
 *     rich view.
 *   - Plain mode for source code AND for the source form of markdown /
 *     HTML files (so users can inspect the markup behind a rich preview).
 *
 * When we don't have a Prism grammar for the file — or the file is too
 * large to highlight without freezing the page — we fall through to a
 * plain `<pre>` so the bytes still show. The wrapper styling matches the
 * right-pane background so the highlighted block reads as part of the
 * surrounding chrome instead of a floating card.
 */
export function HighlightedSourceView({
  path,
  text,
  mimeType,
}: HighlightedSourceViewProps) {
  const { t } = useTranslation("openhands");
  const language = getPrismLanguageForFile(path, mimeType);
  const tooLarge = language ? isTooLargeToHighlight(text) : false;

  if (!language || tooLarge) {
    return (
      <div className="flex h-full w-full flex-col bg-[var(--oh-surface)]">
        {tooLarge && (
          <div
            data-testid="file-content-viewer-large-file-note"
            className="shrink-0 border-b border-[var(--oh-border)] px-4 py-1.5 text-xs text-[var(--oh-muted)]"
          >
            {t(I18nKey.FILES$LARGE_FILE_HIGHLIGHTING_OFF)}
          </div>
        )}
        <pre
          data-testid="file-content-viewer-plain"
          className="min-h-0 w-full flex-1 overflow-auto whitespace-pre-wrap break-words p-4 text-xs leading-5 text-white custom-scrollbar-always"
        >
          {text}
        </pre>
      </div>
    );
  }

  return (
    <div
      data-testid="file-content-viewer-highlighted"
      data-language={language}
      className="h-full w-full overflow-auto bg-[var(--oh-surface)] custom-scrollbar-always"
    >
      <SyntaxHighlighter
        language={language}
        style={vscDarkPlus}
        showLineNumbers
        wrapLongLines={false}
        // Override the theme's hard-coded background so the highlighter
        // blends with the right-pane chrome instead of painting a slab
        // of a slightly-different dark color.
        customStyle={{
          margin: 0,
          padding: "1rem",
          background: "transparent",
          fontSize: "0.75rem",
          lineHeight: "1.25rem",
          minHeight: "100%",
        }}
        codeTagProps={{
          style: { background: "transparent", fontFamily: "inherit" },
        }}
        lineNumberStyle={{
          color: "var(--oh-border)",
          minWidth: "2.5em",
          paddingRight: "1em",
          userSelect: "none",
        }}
      >
        {text}
      </SyntaxHighlighter>
    </div>
  );
}
