/**
 * Citations in grounded answers. The service asks the model to end every
 * factual sentence with `[n]`; the UI turns those markers into links to the
 * passage they point at and flags any number that points at nothing.
 */

export type AnswerSegment =
  | { kind: "text"; text: string }
  | { kind: "cite"; n: number; valid: boolean };

/** Splits an answer into text and citation markers, e.g. "x [1][2]." */
export function segmentAnswer(
  answer: string,
  sourceCount: number,
): AnswerSegment[] {
  const segments: AnswerSegment[] = [];
  let last = 0;
  for (const match of answer.matchAll(/\[(\d{1,3})\]/g)) {
    const index = match.index ?? 0;
    if (index > last)
      segments.push({ kind: "text", text: answer.slice(last, index) });
    const n = Number(match[1]);
    segments.push({ kind: "cite", n, valid: n >= 1 && n <= sourceCount });
    last = index + match[0].length;
  }
  if (last < answer.length)
    segments.push({ kind: "text", text: answer.slice(last) });
  return segments;
}

/** Share of non-empty sentences that carry at least one valid citation. */
export function citationCoverage(answer: string, sourceCount: number): number {
  const sentences = answer
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => /[A-Za-z0-9]/.test(s) && s.length > 12);
  if (sentences.length === 0) return 0;
  const cited = sentences.filter((s) =>
    [...s.matchAll(/\[(\d{1,3})\]/g)].some((m) => {
      const n = Number(m[1]);
      return n >= 1 && n <= sourceCount;
    }),
  ).length;
  return cited / sentences.length;
}
