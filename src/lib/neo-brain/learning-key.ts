import { normalizeSubject } from "#/lib/workspace-memory/write-gate";
import type { MemoryKind } from "#/lib/workspace-memory/types";

/**
 * Stable identity of a claim. Matches the write gate's dedupe key, so a
 * learning heard again maps onto the record it already produced.
 */
export function learningKey(
  kind: MemoryKind,
  subject: string,
  statement: string,
): string {
  return `${kind}|${normalizeSubject(subject)}|${statement
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()}`;
}

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "to",
  "of",
  "in",
  "on",
  "for",
  "and",
  "or",
  "is",
  "are",
  "be",
  "we",
  "you",
  "our",
  "this",
  "that",
  "it",
  "please",
  "always",
  "never",
  "don't",
  "do",
  "not",
  "any",
  "with",
  "from",
  "now",
]);

/** A short, readable subject slug from the meaningful words of a sentence. */
export function subjectSlug(text: string, words = 4): string {
  const picked = text
    .toLowerCase()
    .replace(/[`'"()[\]{}.,;:!?]/g, " ")
    .split(/\s+/)
    .filter((word) => word && !STOPWORDS.has(word))
    .slice(0, words);
  return picked.join("-") || "general";
}
