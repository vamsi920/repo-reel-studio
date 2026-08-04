/** Trimmed, de-duplicated, non-empty strings preserving first-seen order. */
export const uniqueStrings = (values: Array<string | null | undefined>): string[] =>
  Array.from(
    new Set(
      values
        .filter((value): value is string => Boolean(value && value.trim()))
        .map((value) => value.trim())
    )
  );

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const toSentenceCase = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1);

/** "src/foo_bar.ts" -> "Foo Bar" */
export const humanizeName = (value: string): string =>
  value
    .replace(/[_-]+/g, " ")
    .replace(/\.[^/.]+$/, "")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();

export const slugify = (value: string, fallback = "module"): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || fallback;

export const countWords = (text: string | null | undefined): number =>
  text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
