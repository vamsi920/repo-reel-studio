import { useMemo } from "react";

import {
  listKnownWorkspaceIds,
  readRecords,
} from "#/api/workspace-memory/workspace-memory-store.api";
import { getPendingMirrorCount } from "#/api/workspace-memory/workspace-memory-mirror";
import {
  aggregateSavings,
  filterSamplesForMonth,
  type MemoryRecord,
  type SavingsSample,
  type SavingsSummary,
} from "#/lib/workspace-memory";
import type { RealUsageEvent } from "#/lib/real-usage/types";
import useWorkspaceMemoryStore from "#/stores/workspace-memory-store";
import useRealUsageStore from "#/stores/real-usage-store";

export type UsageSelection = { workspaceId: string } | { all: true };

export interface WorkspaceHealthRow {
  workspaceId: string;
  total: number;
  active: number;
  conflicted: number;
  pendingMirror: number;
}

export interface MemoryHealth {
  total: number;
  active: number;
  validated: number;
  superseded: number;
  conflicted: number;
  /** Records derived from a commit other than the repository's current one. */
  staleRepositoryMemories: number;
  pendingMirror: number;
  lastMirror: { at: string; flushed: number; error?: string } | null;
  /**
   * Full record text for a conflicting pair. Populated only when a single
   * workspace is selected -- in "all workspaces" mode this is always empty
   * and `byWorkspace` carries the rollup instead, so one workspace's record
   * content is never shown while the user is looking at another's numbers.
   */
  conflicts: Array<{ record: MemoryRecord; peers: MemoryRecord[] }>;
  /** Per-workspace counts only, no record content. Populated in "all" mode. */
  byWorkspace: WorkspaceHealthRow[];
}

export interface UsageData {
  /** Null in "all workspaces" mode. */
  workspaceId: string | null;
  records: MemoryRecord[];
  allTime: SavingsSummary;
  thisMonth: SavingsSummary;
  health: MemoryHealth;
}

function isAllSelection(selection: UsageSelection): selection is { all: true } {
  return "all" in selection && selection.all;
}

function buildHealthForWorkspace(
  workspaceId: string,
  currentCommitSha: string | null | undefined,
  lastMirrorByWorkspace: Record<
    string,
    { at: string; flushed: number; error?: string }
  >,
  includeConflictDetail: boolean,
): { records: MemoryRecord[]; health: Omit<MemoryHealth, "byWorkspace"> } {
  const records = readRecords(workspaceId);
  const byId = new Map(records.map((record) => [record.id, record]));
  const conflicted = records.filter((record) => record.status === "conflicted");

  return {
    records,
    health: {
      total: records.length,
      active: records.filter((record) => record.status === "active").length,
      validated: records.filter((record) => record.provenance.grounded).length,
      superseded: records.filter((record) => record.status === "superseded")
        .length,
      conflicted: conflicted.length,
      staleRepositoryMemories: currentCommitSha
        ? records.filter(
            (record) =>
              record.status === "active" &&
              record.provenance.commitSha &&
              record.provenance.commitSha !== currentCommitSha,
          ).length
        : 0,
      pendingMirror: getPendingMirrorCount(workspaceId),
      lastMirror: lastMirrorByWorkspace[workspaceId] ?? null,
      conflicts: includeConflictDetail
        ? conflicted.map((record) => ({
            record,
            peers: record.conflictsWith
              .map((id) => byId.get(id))
              .filter((peer): peer is MemoryRecord => Boolean(peer)),
          }))
        : [],
    },
  };
}

const EMPTY_HEALTH: MemoryHealth = {
  total: 0,
  active: 0,
  validated: 0,
  superseded: 0,
  conflicted: 0,
  staleRepositoryMemories: 0,
  pendingMirror: 0,
  lastMirror: null,
  conflicts: [],
  byWorkspace: [],
};

function inCurrentUtcMonth(at: string, now: Date): boolean {
  const timestamp = new Date(at);
  return (
    timestamp.getUTCFullYear() === now.getUTCFullYear() &&
    timestamp.getUTCMonth() === now.getUTCMonth()
  );
}

function eventTokenTotal(event: RealUsageEvent): number {
  return (
    event.usage.promptTokens +
    event.usage.completionTokens +
    event.usage.cacheReadTokens +
    event.usage.cacheWriteTokens
  );
}

/**
 * Real usage's own totals -- what the app actually spent, independent of
 * whether memory compression ever contributed anything.
 */
function aggregateRealUsage(events: readonly RealUsageEvent[]): {
  tokensUsed: number;
  costUsd: number | null;
} {
  const tokensUsed = events.reduce(
    (sum, event) => sum + eventTokenTotal(event),
    0,
  );
  const pricedEvents = events.filter((event) => event.costUsd !== null);
  const costUsd =
    pricedEvents.length > 0
      ? pricedEvents.reduce((sum, event) => sum + (event.costUsd ?? 0), 0)
      : null;
  return { tokensUsed, costUsd };
}

/**
 * Merges genuine spend (real usage) with the memory-compression-specific
 * savings mechanism into the one `SavingsSummary` shape the tabs already
 * render, so no tab needs to change:
 *
 * - `tokensUsed`/`costWithOptimization` are real, populated by ordinary use
 *   regardless of whether memory ever triggers -- this is the fix for the
 *   page staying empty under heavy use.
 * - `tokensAvoided`/`cachedTokensReused`/`averageCompressionRatio`/
 *   `cacheHitRate`/`estimatedCostAvoided` keep coming from the existing
 *   `SavingsSample` mechanism unchanged -- a real, non-zero number only when
 *   memory compression genuinely contributed, never fabricated from real
 *   usage volume alone.
 * - `costWithoutOptimization` becomes real cost + memory's own estimated
 *   saving -- a coherent "what it would have cost without memory
 *   compression's contribution", not two unrelated scales next to each
 *   other.
 */
function mergeSummary(
  realEvents: readonly RealUsageEvent[],
  memorySamples: readonly SavingsSample[],
): SavingsSummary {
  const memory = aggregateSavings(memorySamples);
  const real = aggregateRealUsage(realEvents);

  const costWithoutOptimization =
    real.costUsd !== null
      ? real.costUsd + (memory.estimatedCostAvoided ?? 0)
      : null;

  return {
    samples: realEvents.length + memory.samples,
    tokensUsed: real.tokensUsed,
    tokensAvoided: memory.tokensAvoided,
    cachedTokensReused: memory.cachedTokensReused,
    cacheHitRate: memory.cacheHitRate,
    averageCompressionRatio: memory.averageCompressionRatio,
    retrievalCount: memory.retrievalCount,
    costWithOptimization: real.costUsd,
    costWithoutOptimization,
    estimatedCostAvoided: memory.estimatedCostAvoided,
    hasUnpricedSamples: memory.hasUnpricedSamples,
  };
}

/**
 * Reads everything the Usage tabs display. All of it is measured: nothing here
 * is projected, extrapolated, or filled in when a value is unavailable.
 *
 * `selection` is resolved by the caller (a picked workspace, or "all
 * workspaces") -- this hook never guesses a workspace on its own, unlike the
 * conversation-scoped `useWorkspaceId`, which does not apply on a page with no
 * active conversation.
 */
export function useUsageData(
  selection: UsageSelection,
  currentCommitSha?: string | null,
): UsageData {
  const samplesByWorkspace = useWorkspaceMemoryStore(
    (state) => state.samplesByWorkspace,
  );
  const lastMirrorByWorkspace = useWorkspaceMemoryStore(
    (state) => state.lastMirrorByWorkspace,
  );
  // Any accepted write publishes activity, so this doubles as the signal that
  // the record set changed and these memos should recompute.
  const activity = useWorkspaceMemoryStore((state) => state.activity);
  const realUsageByWorkspace = useRealUsageStore(
    (state) => state.eventsByWorkspace,
  );
  const selectionKey = isAllSelection(selection)
    ? "all"
    : selection.workspaceId;

  return useMemo(() => {
    const now = new Date();

    if (isAllSelection(selection)) {
      // Union, not just the memory store's ids: a workspace can have measured
      // savings (zustand) without currently holding any memory record (e.g.
      // everything it wrote has since been pruned), and the aggregate must
      // still count it rather than silently dropping its history.
      const workspaceIds = Array.from(
        new Set([
          ...listKnownWorkspaceIds(),
          ...Object.keys(samplesByWorkspace),
          ...Object.keys(realUsageByWorkspace),
        ]),
      );
      const memorySamples: SavingsSample[] = workspaceIds.flatMap(
        (id) => samplesByWorkspace[id] ?? [],
      );
      const realEvents: RealUsageEvent[] = workspaceIds.flatMap(
        (id) => realUsageByWorkspace[id] ?? [],
      );

      const rows: WorkspaceHealthRow[] = workspaceIds.map((id) => {
        const { health } = buildHealthForWorkspace(
          id,
          currentCommitSha,
          lastMirrorByWorkspace,
          false,
        );
        return {
          workspaceId: id,
          total: health.total,
          active: health.active,
          conflicted: health.conflicted,
          pendingMirror: health.pendingMirror,
        };
      });

      const health: MemoryHealth = rows.reduce(
        (acc, row) => ({
          ...acc,
          total: acc.total + row.total,
          active: acc.active + row.active,
          conflicted: acc.conflicted + row.conflicted,
          pendingMirror: acc.pendingMirror + row.pendingMirror,
        }),
        { ...EMPTY_HEALTH, byWorkspace: rows },
      );

      return {
        workspaceId: null,
        records: [],
        allTime: mergeSummary(realEvents, memorySamples),
        thisMonth: mergeSummary(
          realEvents.filter((event) => inCurrentUtcMonth(event.at, now)),
          filterSamplesForMonth(
            memorySamples,
            now.getUTCFullYear(),
            now.getUTCMonth(),
          ),
        ),
        health,
      };
    }

    const { workspaceId } = selection;
    const memorySamples = samplesByWorkspace[workspaceId] ?? [];
    const realEvents = realUsageByWorkspace[workspaceId] ?? [];
    const { records, health } = buildHealthForWorkspace(
      workspaceId,
      currentCommitSha,
      lastMirrorByWorkspace,
      true,
    );

    return {
      workspaceId,
      records,
      allTime: mergeSummary(realEvents, memorySamples),
      thisMonth: mergeSummary(
        realEvents.filter((event) => inCurrentUtcMonth(event.at, now)),
        filterSamplesForMonth(
          memorySamples,
          now.getUTCFullYear(),
          now.getUTCMonth(),
        ),
      ),
      health: { ...health, byWorkspace: [] },
    };
    // `selection` is a fresh object each render from the caller; the two
    // primitive fields it can carry are what actually determine the result,
    // so those -- not the object itself -- are the real dependencies.
  }, [
    selectionKey,
    samplesByWorkspace,
    lastMirrorByWorkspace,
    realUsageByWorkspace,
    activity,
    currentCommitSha,
  ]);
}
