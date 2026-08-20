/**
 * Memory updates run behind the user, never in front of them.
 *
 * Producers (SME, requirements approval, agent runs, PR outcomes, knowledge
 * indexing) call `submitMemoryCandidate` and move on. Candidates accumulate
 * and drain on an idle callback: gate, supersede, persist, queue the mirror,
 * publish an activity line. Nothing here blocks a render or a send.
 */
import {
  readRecords,
  writeRecords,
} from "#/api/workspace-memory/workspace-memory-store.api";
import { enqueueMirror } from "#/api/workspace-memory/workspace-memory-mirror";

import { applyTemporalSupersede } from "./supersede";
import type { MemoryCandidate, WorkspaceActivityEvent } from "./types";
import { evaluateWrite, type WriteGateReason } from "./write-gate";
import WorkspaceContextService from "./workspace-context-service";

const queue: MemoryCandidate[] = [];
const MAX_QUEUE = 200;

let scheduled = false;
let activitySink: ((event: WorkspaceActivityEvent) => void) | null = null;

export interface DrainResult {
  accepted: number;
  rejected: number;
  superseded: number;
  conflicted: number;
  rejectionReasons: WriteGateReason[];
}

/** Wired by the store on mount so activity reaches the Usage surface. */
export function setActivitySink(
  sink: ((event: WorkspaceActivityEvent) => void) | null,
): void {
  activitySink = sink;
}

function publish(
  workspaceId: string,
  kind: WorkspaceActivityEvent["kind"],
  summary: string,
): void {
  activitySink?.({
    id: `act-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    workspaceId,
    at: new Date().toISOString(),
    kind,
    summary,
  });
}

function scheduleDrain(): void {
  if (scheduled) return;
  scheduled = true;
  const run = () => {
    scheduled = false;
    drain();
  };
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    (
      window as Window & {
        requestIdleCallback: (
          cb: () => void,
          opts?: { timeout: number },
        ) => number;
      }
    ).requestIdleCallback(run, { timeout: 2000 });
  } else {
    setTimeout(run, 250);
  }
}

/**
 * The single entry point for every producer. Returns immediately; the
 * candidate may or may not survive the write gate.
 */
export function submitMemoryCandidate(candidate: MemoryCandidate): void {
  if (!candidate?.workspaceId) return;
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push(candidate);
  scheduleDrain();
}

export function getQueueDepth(): number {
  return queue.length;
}

/** Exposed for tests and for a synchronous flush before teardown. */
export function drain(): DrainResult {
  const result: DrainResult = {
    accepted: 0,
    rejected: 0,
    superseded: 0,
    conflicted: 0,
    rejectionReasons: [],
  };
  if (queue.length === 0) return result;

  const batch = queue.splice(0, queue.length);
  const touchedWorkspaces = new Set<string>();

  batch.forEach((candidate) => {
    const { workspaceId } = candidate;
    const existing = readRecords(workspaceId);
    const verdict = evaluateWrite(candidate, existing);

    if (!verdict.accepted || !verdict.record) {
      result.rejected += 1;
      result.rejectionReasons.push(verdict.reason);
      return;
    }

    const folded = applyTemporalSupersede(existing, verdict.record);
    writeRecords(workspaceId, folded.records);
    enqueueMirror(workspaceId, verdict.record);

    result.accepted += 1;
    result.superseded += folded.supersededIds.length;
    result.conflicted += folded.conflictedIds.length;
    touchedWorkspaces.add(workspaceId);

    if (folded.supersededIds.length > 0) {
      publish(
        workspaceId,
        "superseded",
        `Memory updater: ${candidate.kind} "${candidate.subject}" superseded ${folded.supersededIds.length} earlier record(s)`,
      );
    }
    if (folded.conflictedIds.length > 0) {
      publish(
        workspaceId,
        "conflicted",
        `Memory updater: conflicting sources recorded for "${candidate.subject}"`,
      );
    }
  });

  touchedWorkspaces.forEach((workspaceId) => {
    WorkspaceContextService.invalidate(workspaceId);
    publish(
      workspaceId,
      "cache-refreshed",
      "Memory updater: context cache refreshed",
    );
  });

  if (result.accepted > 0) {
    const workspaceId = batch[0].workspaceId;
    publish(
      workspaceId,
      "learned",
      `Memory updater: ${result.accepted} validated fact(s) added`,
    );
  }

  return result;
}

/** Test-only. */
export function resetMemoryUpdater(): void {
  queue.length = 0;
  scheduled = false;
  activitySink = null;
}
