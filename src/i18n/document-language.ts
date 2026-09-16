/**
 * Mirrors the active UI language onto the document element so assistive
 * technology announces translated strings with the right pronunciation rules.
 *
 * The layout is written with physical (left/right) spacing and is not
 * RTL-ready yet, so `dir` is always "ltr" — even for Arabic. The language
 * picker shows a note for RTL languages; `isRtlLanguage` is the single place
 * to flip that once the layout can mirror.
 */
export const RTL_LANGUAGES: ReadonlySet<string> = new Set(["ar"]);

export const DOCUMENT_TEXT_DIRECTION = "ltr";

export const isRtlLanguage = (language: string | undefined | null) => {
  if (!language) return false;
  const base = language.split("-")[0].toLowerCase();
  return RTL_LANGUAGES.has(base);
};

export const applyDocumentLanguage = (
  language: string | undefined | null,
  doc: Pick<Document, "documentElement"> | undefined = typeof document ===
  "undefined"
    ? undefined
    : document,
) => {
  if (!doc || !language) return;
  const root = doc.documentElement;
  if (root.lang !== language) {
    root.lang = language;
  }
  if (root.dir !== DOCUMENT_TEXT_DIRECTION) {
    root.dir = DOCUMENT_TEXT_DIRECTION;
  }
};
