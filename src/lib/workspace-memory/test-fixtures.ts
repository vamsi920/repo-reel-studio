import { evaluateWrite } from "./write-gate";
import type { MemoryCandidate, MemoryRecord } from "./types";

/** Builds a candidate that clears the write gate unless a test says otherwise. */
export function candidate(
  overrides: Partial<MemoryCandidate> & { statement: string; subject: string },
): MemoryCandidate {
  return {
    workspaceId: "ws_test",
    kind: "fact",
    tags: [],
    confidence: 0.9,
    ...overrides,
    provenance: {
      source: "user-decision",
      conversationId: "conv-1",
      observedAt: "2026-01-01T00:00:00.000Z",
      ...overrides.provenance,
    },
  };
}

/** Runs a candidate through the gate and returns the record, failing loudly. */
export function makeRecord(
  overrides: Partial<MemoryCandidate> & { statement: string; subject: string },
): MemoryRecord {
  const verdict = evaluateWrite(candidate(overrides), []);
  if (!verdict.record) {
    throw new Error(`fixture rejected by write gate: ${verdict.reason}`);
  }
  return verdict.record;
}
