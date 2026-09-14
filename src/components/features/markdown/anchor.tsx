import React from "react";
import { ExtraProps } from "react-markdown";

// Matches a URL with an explicit scheme (`http:`, `mailto:`, `tel:`, etc.).
const URL_SCHEME_RE = /^[a-z][a-z\d+.-]*:/i;

/**
 * True for a markdown link href that is a bare relative path (no scheme, no
 * leading `/`, not an in-page `#anchor`) — e.g. `.github/workflows/foo.yml`.
 * The browser resolves a href like that against the *current* page's URL,
 * which for our generated docs (DeepWiki's `generate_file_url()` returns the
 * raw repo path unchanged for local repos — see
 * `vendor/deepwiki-open/api/services/wiki/content.py`) always lands on a
 * nonexistent in-app route instead of the intended source file. There is no
 * safe destination to navigate to, so these render as plain text instead of
 * a broken link.
 */
function isBareRelativePath(href: string): boolean {
  if (!href || href.startsWith("#") || href.startsWith("/")) return false;
  return !URL_SCHEME_RE.test(href);
}

export function anchor({
  href,
  children,
}: React.ClassAttributes<HTMLAnchorElement> &
  React.AnchorHTMLAttributes<HTMLAnchorElement> &
  ExtraProps) {
  if (isBareRelativePath(href ?? "")) {
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
