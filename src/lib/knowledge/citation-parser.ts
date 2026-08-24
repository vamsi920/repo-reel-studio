/**
 * Extracts real `(path, startLine, endLine)` citations DeepWiki writes into
 * generated page markdown, e.g. `Sources: [src/index.ts:12-34]()`.
 *
 * Direct port of the same regex the vendored backend's own
 * `post_process_wiki_content` uses (`_GENERIC_RE` in
 * `vendor/deepwiki-open/api/services/wiki/content.py`) — for `type: "local"`
 * repos (Neo's only mode), that function's `_citation_link` always
 * returns `None` (no web host to link to), so every citation-resolution
 * branch leaves the `[path:start-end]()` marker untouched in the final
 * content instead of rewriting it into a real link. That means these
 * citations survive verbatim into `page.contentMarkdown` and can be parsed
 * client-side without any backend schema change.
 */
const CITATION_RE =
  /\[([^[\]\s()]+?\.[A-Za-z0-9]+)(?::(\d+)(?:-(\d+))?)?\]\(\)/g;

export interface CitedRange {
  startLine?: number;
  endLine?: number;
}

/** First citation found per path wins — later re-citations of the same file
 * are typically narrower follow-up references, not a better range. */
export function extractCitedRanges(content: string): Map<string, CitedRange> {
  const byPath = new Map<string, CitedRange>();
  CITATION_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CITATION_RE.exec(content)) !== null) {
    const [, path, start, end] = match;
    if (byPath.has(path)) continue;
    byPath.set(path, {
      startLine: start ? Number(start) : undefined,
      endLine: end ? Number(end) : undefined,
    });
  }
  return byPath;
}
