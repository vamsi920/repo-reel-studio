/**
 * Picks which memories are worth spending the task's token budget on.
 *
 * Scoring is deliberately boring and deterministic: pinned first, then kind
 * weight, recency, confidence, and lexical overlap with the task. No embedding
 * model, no network call -- this runs synchronously on the send path.
 */
import Fuse from "fuse.js";

import { estimateRecordRenderTokens } from "./render";
import type { MemoryKind, MemoryRecord } from "./types";

/**
 * Constraints and policies are the memories whose absence causes rework, so
 * they outrank episodic outcomes when the budget is tight.
 */
const KIND_WEIGHT: Record<MemoryKind, number> = {
  constraint: 1.0,
  policy: 1.0,
  decision: 0.95,
  "business-rule": 0.9,
  convention: 0.85,
  fact: 0.8,
  procedure: 0.75,
  failure: 0.7,
  outcome: 0.6,
};

const RECENCY_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000;
const PINNED_BOOST = 1.5;
const REPOSITORY_MATCH_BOOST = 0.35;
/** Conflicted pairs must reach context together, so they never lose on score. */
const CONFLICT_BOOST = 0.5;

export interface SelectionInput {
  records: readonly MemoryRecord[];
  task: string;
  repositoryId?: string;
  tokenBudget: number;
  /** Overhead the renderer will add (header, framing line, provenance lines). */
  reservedTokens?: number;
}

export interface SelectedRecord {
  record: MemoryRecord;
  score: number;
}

export interface SelectionResult {
  selected: SelectedRecord[];
  candidateRawTokens: number;
  selectedTokensBeforeCompression: number;
}

function recencyScore(record: MemoryRecord, now: number): number {
  const observed =
    Date.parse(record.provenance.observedAt) ||
    Date.parse(record.createdAt) ||
    now;
  const age = Math.max(0, now - observed);
  return 2 ** (-age / RECENCY_HALF_LIFE_MS);
}

/**
 * Fuse is already a dependency and gives a reasonable fuzzy-overlap score
 * without us hand-rolling a tokenizer.
 */
function buildRelevanceScores(
  records: readonly MemoryRecord[],
  task: string,
): Map<string, number> {
  const scores = new Map<string, number>();
  const query = task.trim().slice(0, 400);
  if (!query || records.length === 0) return scores;

  const fuse = new Fuse(records as MemoryRecord[], {
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.6,
    keys: [
      { name: "statement", weight: 0.6 },
      { name: "subject", weight: 0.25 },
      { name: "tags", weight: 0.15 },
    ],
  });

  fuse.search(query).forEach(({ item, score }) => {
    // Fuse scores are distances: 0 is perfect, 1 is unrelated.
    scores.set(item.id, 1 - (score ?? 1));
  });
  return scores;
}

export function scoreRecord(
  record: MemoryRecord,
  relevance: number,
  repositoryId: string | undefined,
  now: number,
): number {
  const base =
    KIND_WEIGHT[record.kind] * 0.9 +
    recencyScore(record, now) * 0.6 +
    record.confidence * 0.4 +
    relevance * 1.2;

  const repositoryBoost =
    repositoryId && record.provenance.repositoryId === repositoryId
      ? REPOSITORY_MATCH_BOOST
      : 0;
  const pinned = record.pinned ? PINNED_BOOST : 0;
  const conflicted = record.status === "conflicted" ? CONFLICT_BOOST : 0;

  return base + repositoryBoost + pinned + conflicted;
}

/**
 * Greedy knapsack by score, skipping records that no longer fit rather than
 * stopping at the first one -- a single long record should not shut out the
 * cheap ones behind it.
 */
export function selectRecords(input: SelectionInput): SelectionResult {
  const now = Date.now();
  const active = input.records.filter(
    (record) => record.status !== "superseded",
  );
  const candidateRawTokens = input.records.reduce(
    (sum, record) => sum + record.tokenCost,
    0,
  );

  const relevance = buildRelevanceScores(active, input.task);
  const ranked = active
    .map((record) => ({
      record,
      score: scoreRecord(
        record,
        relevance.get(record.id) ?? 0,
        input.repositoryId,
        now,
      ),
    }))
    .sort((a, b) => b.score - a.score);

  const budget = Math.max(0, input.tokenBudget - (input.reservedTokens ?? 0));
  const renderCost = new Map<string, number>();
  const costOf = (record: MemoryRecord): number => {
    const cached = renderCost.get(record.id);
    if (cached !== undefined) return cached;
    const cost = estimateRecordRenderTokens(record);
    renderCost.set(record.id, cost);
    return cost;
  };

  const selected: SelectedRecord[] = [];
  let used = 0;

  ranked.forEach((entry) => {
    const cost = costOf(entry.record);
    if (used + cost > budget) return;
    selected.push(entry);
    used += cost;
  });

  // A conflicted record is only useful next to the record it conflicts with.
  const selectedIds = new Set(selected.map((entry) => entry.record.id));
  ranked.forEach((entry) => {
    if (!selectedIds.has(entry.record.id)) return;
    entry.record.conflictsWith.forEach((peerId) => {
      if (selectedIds.has(peerId)) return;
      const peer = ranked.find((other) => other.record.id === peerId);
      if (!peer || used + costOf(peer.record) > budget) return;
      selected.push(peer);
      selectedIds.add(peerId);
      used += costOf(peer.record);
    });
  });

  return {
    selected,
    candidateRawTokens,
    selectedTokensBeforeCompression: used,
  };
}
