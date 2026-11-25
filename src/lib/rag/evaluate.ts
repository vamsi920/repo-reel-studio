/**
 * Retrieval quality, measured (specs/neo-rag.md, RAG-007).
 *
 * A test case is a question plus a short piece of text that a correct passage
 * must contain ("expected"). A case is a hit at rank r when the r-th result
 * contains the expected text (case- and whitespace-insensitive), or, for
 * longer expectations, at least 80% of its meaningful words.
 *
 * - recall@k: share of cases with a hit in the top k results.
 * - MRR: mean of 1/rank of the first hit (0 when there is none).
 */

export interface EvalCaseInput {
  id: string;
  question: string;
  expected: string;
}

export interface EvalCaseResult {
  id: string;
  question: string;
  expected: string;
  rank: number | null;
  topTitle: string | null;
}

export interface EvalMetrics {
  cases: number;
  recallAt1: number;
  recallAt3: number;
  recallAt5: number;
  mrr: number;
}

function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

const STOP = new Set([
  "the",
  "a",
  "an",
  "of",
  "to",
  "and",
  "or",
  "in",
  "on",
  "is",
  "are",
  "for",
  "with",
  "be",
  "it",
]);

function words(text: string): string[] {
  return normalise(text)
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

export function passageMatches(passage: string, expected: string): boolean {
  const haystack = normalise(passage);
  const needle = normalise(expected);
  if (!needle) return false;
  if (haystack.includes(needle)) return true;
  const expectedWords = words(expected);
  if (expectedWords.length < 4) return false;
  const present = new Set(words(passage));
  const found = expectedWords.filter((w) => present.has(w)).length;
  return found / expectedWords.length >= 0.8;
}

export function firstHitRank(
  passages: readonly {
    content: string;
    heading_path?: string;
    title?: string;
  }[],
  expected: string,
): number | null {
  const index = passages.findIndex((p) =>
    passageMatches(
      `${p.title ?? ""}\n${p.heading_path ?? ""}\n${p.content}`,
      expected,
    ),
  );
  return index === -1 ? null : index + 1;
}

export function computeMetrics(
  results: readonly EvalCaseResult[],
): EvalMetrics {
  const n = results.length;
  if (n === 0)
    return { cases: 0, recallAt1: 0, recallAt3: 0, recallAt5: 0, mrr: 0 };
  const within = (k: number) =>
    results.filter((r) => r.rank !== null && r.rank <= k).length / n;
  const mrr =
    results.reduce((sum, r) => sum + (r.rank ? 1 / r.rank : 0), 0) / n;
  const round = (x: number) => Math.round(x * 1000) / 1000;
  return {
    cases: n,
    recallAt1: round(within(1)),
    recallAt3: round(within(3)),
    recallAt5: round(within(5)),
    mrr: round(mrr),
  };
}
