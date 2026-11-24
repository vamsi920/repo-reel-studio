/**
 * The "gets smarter every week" pass. Runs in the background, at most once a
 * day per workspace, over records that already passed the write gate:
 *
 * - Reinforce: a learning heard in two or more conversations is trusted more;
 *   heard in three, it is pinned, so it is always in the agent's context. A
 *   repeated preference becomes a standing policy.
 * - Decay: a run-derived learning (command recipes, recoveries) that nobody
 *   has confirmed for `STALE_AFTER_DAYS` loses confidence and is tagged stale,
 *   so it ranks below fresh knowledge instead of misleading forever.
 *
 * It never deletes and never rewrites a statement: superseding stays the
 * write path's job, and the trail stays intact.
 */
import type { MemoryRecord } from "#/lib/workspace-memory/types";

import { learningKey } from "./learning-key";
import type { BrainSighting } from "./types";

export const REINFORCE_AT = 2;
export const PIN_AT = 3;
export const STALE_AFTER_DAYS = 45;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_CONFIDENCE = 0.3;

/** Layers a person states; reinforcement is about people repeating themselves. */
const REINFORCEABLE = new Set([
  "policy",
  "convention",
  "decision",
  "constraint",
  "procedure",
  "failure",
  "fact",
]);

/** Layers derived from runs, which go stale as the repo changes. */
const DECAYABLE_SOURCES = new Set(["verified-agent-result", "test-result"]);

export interface ConsolidationReport {
  records: MemoryRecord[];
  reinforced: string[];
  pinned: string[];
  decayed: string[];
  changed: boolean;
}

function addTag(tags: string[], tag: string): string[] {
  return tags.includes(tag) ? tags : [...tags, tag];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function consolidate(
  records: readonly MemoryRecord[],
  sightings: Readonly<Record<string, BrainSighting>>,
  now: Date = new Date(),
): ConsolidationReport {
  const reinforced: string[] = [];
  const pinned: string[] = [];
  const decayed: string[] = [];

  const next = records.map((record) => {
    if (record.status === "superseded") return record;
    const key = learningKey(record.kind, record.subject, record.statement);
    const sighting = sightings[key];
    const heard = sighting?.conversations.length ?? 0;
    let updated = record;

    if (REINFORCEABLE.has(record.kind) && heard >= REINFORCE_AT) {
      const target = round(Math.min(1, 0.85 + 0.05 * heard));
      if (target > record.confidence || !record.tags.includes("reinforced")) {
        updated = {
          ...updated,
          confidence: Math.max(record.confidence, target),
          tags: addTag(updated.tags, "reinforced"),
        };
        reinforced.push(record.id);
      }
      if (heard >= PIN_AT && !record.pinned) {
        updated = { ...updated, pinned: true };
        pinned.push(record.id);
      }
    }

    const lastConfirmed = Math.max(
      Date.parse(sighting?.lastSeen ?? "") || 0,
      Date.parse(record.provenance.observedAt) || 0,
    );
    const ageDays = (now.getTime() - lastConfirmed) / DAY_MS;
    if (
      DECAYABLE_SOURCES.has(record.provenance.source) &&
      !updated.pinned &&
      ageDays > STALE_AFTER_DAYS &&
      !updated.tags.includes("stale")
    ) {
      updated = {
        ...updated,
        confidence: round(Math.max(MIN_CONFIDENCE, updated.confidence * 0.7)),
        tags: addTag(updated.tags, "stale"),
      };
      decayed.push(record.id);
    }

    return updated;
  });

  return {
    records: next,
    reinforced,
    pinned,
    decayed,
    changed: reinforced.length + pinned.length + decayed.length > 0,
  };
}
