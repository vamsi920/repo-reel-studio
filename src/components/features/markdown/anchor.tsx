import React from "react";
import { ExtraProps } from "react-markdown";

// Matches a URL with an explicit scheme (`http:`, `mailto:`, `tel:`, etc.).
const URL_SCHEME_RE = /^[a-z][a-z\d+.-]*:/i;

/**
 * True for a markdown link href with no safe destination to navigate to:
 * either empty (DeepWiki's `post_process_wiki_content` leaves unresolved
 * `[path:start-end]()` citation markers as a literal empty href for
 * `type: "local"` repos — see `citation-parser.ts`'s header comment) or a
 * bare relative path (no scheme, no leading `/`, not an in-page `#anchor`,
 * e.g. `.github/workflows/foo.yml`) that the browser would otherwise resolve
 * against the *current* page's URL (DeepWiki's `generate_file_url()` returns
 * the raw repo path unchanged for local repos — see
 * `vendor/deepwiki-open/api/services/wiki/content.py`), landing on a
 * nonexistent in-app route instead of the intended source file. Both render
 * as plain text instead of a link that looks clickable but goes nowhere.
 */
function hasNoSafeDestination(href: string): boolean {
  if (!href) return true;
  if (href.startsWith("#") || href.startsWith("/")) return false;
  return !URL_SCHEME_RE.test(href);
}

export function anchor({
  href,
  children,
}: React.ClassAttributes<HTMLAnchorElement> &
  React.AnchorHTMLAttributes<HTMLAnchorElement> &
  ExtraProps) {
  if (hasNoSafeDestination(href ?? "")) {
    return (
      <span className="text-[var(--oh-muted)]" title={href}>
        {children}
      </span>
    );
  }

  return (
    <a
      className="text-blue-500 hover:underline"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}
