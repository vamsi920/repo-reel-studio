/**
 * The title-generation LLM (server-side, not owned by this repo) prefixes
 * auto-generated conversation titles with a decorative emoji (e.g. "✨ Build
 * a Simple Weather App"). Product direction is a clean, professional title
 * list, so this strips any emoji run — plus the variation-selector/
 * zero-width-joiner code points that compose multi-part emoji, and the
 * whitespace right after it — from the front of a title before it's shown
 * anywhere in the UI. Purely a display-layer transform: the stored title on
 * the server is untouched, so renaming/editing still round-trips normally.
 */
const LEADING_EMOJI_RE = /^[\p{Extended_Pictographic}\u{FE0F}\u{200D}\s]+/u;

export function stripLeadingEmoji(title: string): string {
  const stripped = title.replace(LEADING_EMOJI_RE, "");
  return stripped.length > 0 ? stripped : title;
}
