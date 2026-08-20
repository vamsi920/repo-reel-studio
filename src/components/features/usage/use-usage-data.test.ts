/**
 * The bug this guards against: "all workspaces" mode either showing nothing
 * (the original report) or showing one workspace's conflict text while the
 * user thinks they're looking at everything. Neither is acceptable.
 */
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  resetWorkspaceMemoryStorage,
  writeRecords,
} from "#/api/workspace-memory/workspace-memory-store.api";
import { resetMirrorQueue } from "#/api/workspace-memory/workspace-memory-mirror";
import { computeWorkspaceId, type SavingsSample } from "#/lib/workspace-memory";
import { makeRecord } from "#/lib/workspace-memory/test-fixtures";
import useWorkspaceMemoryStore from "#/stores/workspace-memory-store";

import { useUsageData } from "./use-usage-data";

const WORKSPACE_A = computeWorkspaceId("backend-1", "/w/a")!;
const WORKSPACE_B = computeWorkspaceId("backend-1", "/w/b")!;

function sample(
  workspaceId: string,
  overrides: Partial<SavingsSample> = {},
): SavingsSample {
  return {
    workspaceId,
    conversationId: "conv-1",
    at: new Date().toISOString(),
    candidateRawTokens: 1000,
    selectedTokensBeforeCompression: 500,
    finalContextTokens: 400,
    cachedTokensReused: 0,
    compressionRatio: 0.2,
    model: "claude-sonnet-4-5",
    fromCache: false,
    ...overrides,
  };
}

beforeEach(() => {
  resetWorkspaceMemoryStorage();
  resetMirrorQueue();
  useWorkspaceMemoryStore.setState({
    activeWorkspaceId: null,
    activity: [],
    samplesByWorkspace: {},
    lastMirrorByWorkspace: {},
  });
});

describe("useUsageData", () => {
  it("sums both workspaces in all mode and lists each in the breakdown", () => {
    const conflictedA = makeRecord({
      subject: "payments:transport",
      statement: "Payments uses REST.",
      provenance: {
        source: "repository-evidence",
        conversationId: "conv-1",
        observedAt: "2026-03-01T12:00:00.000Z",
        filePath: "docs/a.md",
        commitSha: "aaa",
      },
    });
    const conflictedAPeer = makeRecord({
      subject: "payments:transport",
      statement: "Payments uses gRPC.",
      provenance: {
        source: "repository-evidence",
        conversationId: "conv-1",
        observedAt: "2026-03-01T12:00:30.000Z",
        filePath: "docs/b.md",
        commitSha: "aaa",
      },
    });
    writeRecords(WORKSPACE_A, [
      {
        ...conflictedA,
        workspaceId: WORKSPACE_A,
        status: "conflicted",
        conflictsWith: [conflictedAPeer.id],
      },
      {
        ...conflictedAPeer,
        workspaceId: WORKSPACE_A,
        status: "conflicted",
        conflictsWith: [conflictedA.id],
      },
    ]);
    writeRecords(WORKSPACE_B, [
      {
        ...makeRecord({
          subject: "billing:transport",
          statement: "Billing uses REST.",
        }),
        workspaceId: WORKSPACE_B,
      },
    ]);
    useWorkspaceMemoryStore.getState().recordSavings(sample(WORKSPACE_A));
    useWorkspaceMemoryStore.getState().recordSavings(sample(WORKSPACE_B));

    const { result } = renderHook(() => useUsageData({ all: true }));

    expect(result.current.workspaceId).toBeNull();
    expect(result.current.allTime.samples).toBe(2);
    expect(result.current.health.total).toBe(3);
    expect(result.current.health.conflicted).toBe(2);
    expect(result.current.health.byWorkspace).toHaveLength(2);
    expect(
      result.current.health.byWorkspace.find(
        (r) => r.workspaceId === WORKSPACE_A,
      )?.conflicted,
    ).toBe(2);

    // The load-bearing assertion: no record text leaks into the aggregate view.
    expect(result.current.health.conflicts).toEqual([]);
    expect(result.current.records).toEqual([]);
  });

  it("scopes to exactly one workspace, with full conflict detail, when selected", () => {
    writeRecords(WORKSPACE_A, [
      {
        ...makeRecord({
          subject: "payments:transport",
          statement: "Payments uses REST.",
        }),
        workspaceId: WORKSPACE_A,
      },
    ]);
    writeRecords(WORKSPACE_B, [
      {
        ...makeRecord({
          subject: "billing:transport",
          statement: "Billing uses REST.",
        }),
        workspaceId: WORKSPACE_B,
      },
    ]);

    const { result } = renderHook(() =>
      useUsageData({ workspaceId: WORKSPACE_A }),
    );

    expect(result.current.workspaceId).toBe(WORKSPACE_A);
    expect(result.current.records).toHaveLength(1);
    expect(result.current.records[0].statement).toContain("Payments");
    expect(result.current.health.byWorkspace).toEqual([]);
  });
});
