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
import useWorkspaceMemoryStore from "#/stores/workspace-memory-store";

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
  const selectionKey = isAllSelection(selection)
    ? "all"
    : selection.workspaceId;

  return useMemo(() => {
    if (isAllSelection(selection)) {
      // Union, not just the memory store's ids: a workspace can have measured
      // savings (zustand) without currently holding any memory record (e.g.
      // everything it wrote has since been pruned), and the aggregate must
      // still count it rather than silently dropping its history.
      const workspaceIds = Array.from(
        new Set([
          ...listKnownWorkspaceIds(),
          ...Object.keys(samplesByWorkspace),
        ]),
      );
      const samples: SavingsSample[] = workspaceIds.flatMap(
        (id) => samplesByWorkspace[id] ?? [],
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

      const now = new Date();
      return {
        workspaceId: null,
        records: [],
        allTime: aggregateSavings(samples),
        thisMonth: aggregateSavings(
          filterSamplesForMonth(
            samples,
            now.getUTCFullYear(),
            now.getUTCMonth(),
          ),
        ),
        health,
      };
    }

    const { workspaceId } = selection;
    const samples = samplesByWorkspace[workspaceId] ?? [];
    const { records, health } = buildHealthForWorkspace(
      workspaceId,
      currentCommitSha,
      lastMirrorByWorkspace,
      true,
    );
    const now = new Date();

    return {
      workspaceId,
      records,
      allTime: aggregateSavings(samples),
      thisMonth: aggregateSavings(
        filterSamplesForMonth(samples, now.getUTCFullYear(), now.getUTCMonth()),
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
    activity,
    currentCommitSha,
  ]);
}
