/**
 * Facts change. "Payments uses REST" was true in 2025 and false in 2026, and
 * both of those are worth keeping: the old record stays, marked superseded and
 * pointing at its replacement, so anyone can ask why the answer changed.
 *
 * When two grounded sources disagree at effectively the same time, neither
 * wins. Both are marked `conflicted` and both get rendered into context, so
 * the agent sees the disagreement instead of a coin flip.
 */
import type { MemoryRecord } from "./types";

/**
 * Observations this close together are treated as concurrent -- recency is not
 * evidence of authority over a few minutes.
 */
export const CONFLICT_WINDOW_MS = 5 * 60 * 1000;

/** Sources trusted enough to overrule a concurrent disagreement outright. */
const AUTHORITATIVE_SOURCES = new Set([
  "user-decision",
  "approved-requirement",
  "sme-validated",
]);

export interface SupersedeResult {
  records: MemoryRecord[];
  supersededIds: string[];
  conflictedIds: string[];
}

function observedTime(record: MemoryRecord): number {
  const parsed = Date.parse(record.provenance.observedAt);
  return Number.isNaN(parsed) ? Date.parse(record.createdAt) || 0 : parsed;
}

/** Same claim, different wording -- normalized comparison, not equality. */
function contradicts(a: MemoryRecord, b: MemoryRecord): boolean {
  return a.statement.trim().toLowerCase() !== b.statement.trim().toLowerCase();
}

function isAuthoritative(record: MemoryRecord): boolean {
  return AUTHORITATIVE_SOURCES.has(record.provenance.source);
}

/**
 * Folds `incoming` into `existing`. Returns a new array -- callers persist the
 * result wholesale rather than mutating in place.
 */
export function applyTemporalSupersede(
  existing: readonly MemoryRecord[],
  incoming: MemoryRecord,
): SupersedeResult {
  const supersededIds: string[] = [];
  const conflictedIds: string[] = [];
  const incomingTime = observedTime(incoming);

  const peers = existing.filter(
    (record) =>
      record.id !== incoming.id &&
      record.kind === incoming.kind &&
      record.subject === incoming.subject &&
      record.status !== "superseded",
  );

  let next = existing.map((record) => ({ ...record }));
  const patch = (id: string, changes: Partial<MemoryRecord>) => {
    next = next.map((record) =>
      record.id === id ? { ...record, ...changes } : record,
    );
  };

  const accepted: MemoryRecord = { ...incoming };

  peers.forEach((peer) => {
    if (!contradicts(peer, accepted)) {
      // Same claim restated: keep the older record as the canonical one and
      // let the gate's duplicate check handle the rest.
      return;
    }

    const gap = incomingTime - observedTime(peer);
    const concurrent = Math.abs(gap) < CONFLICT_WINDOW_MS;
    const decidableByAuthority =
      isAuthoritative(accepted) !== isAuthoritative(peer);

    if (concurrent && !decidableByAuthority) {
      patch(peer.id, {
        status: "conflicted",
        conflictsWith: Array.from(
          new Set([...peer.conflictsWith, accepted.id]),
        ),
      });
      accepted.status = "conflicted";
      accepted.conflictsWith = Array.from(
        new Set([...accepted.conflictsWith, peer.id]),
      );
      conflictedIds.push(peer.id, accepted.id);
      return;
    }

    const incomingWins = decidableByAuthority
      ? isAuthoritative(accepted)
      : gap > 0;

    if (incomingWins) {
      patch(peer.id, {
        status: "superseded",
        supersededAt: accepted.provenance.observedAt,
        supersededById: accepted.id,
      });
      supersededIds.push(peer.id);
    } else {
      // The incoming record is the stale one. Keep it for traceability, but it
      // never reaches context.
      accepted.status = "superseded";
      accepted.supersededAt = peer.provenance.observedAt;
      accepted.supersededById = peer.id;
      supersededIds.push(accepted.id);
    }
  });

  return {
    records: [...next, accepted],
    supersededIds: Array.from(new Set(supersededIds)),
    conflictedIds: Array.from(new Set(conflictedIds)),
  };
}
