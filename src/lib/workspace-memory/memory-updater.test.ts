import { beforeEach, describe, expect, it } from "vitest";

import {
  readRecords,
  resetWorkspaceMemoryStorage,
} from "#/api/workspace-memory/workspace-memory-store.api";
import {
  getPendingMirrorCount,
  resetMirrorQueue,
} from "#/api/workspace-memory/workspace-memory-mirror";

import {
  drain,
  resetMemoryUpdater,
  setActivitySink,
  submitMemoryCandidate,
} from "./memory-updater";
import { candidate } from "./test-fixtures";
import type { WorkspaceActivityEvent } from "./types";
import { computeWorkspaceId } from "./workspace-id";
import WorkspaceContextService from "./workspace-context-service";

const WORKSPACE = computeWorkspaceId("backend-1", "/w/a")!;

function submit(overrides: Parameters<typeof candidate>[0]) {
  submitMemoryCandidate({ ...candidate(overrides), workspaceId: WORKSPACE });
}

beforeEach(() => {
  resetWorkspaceMemoryStorage();
  resetMirrorQueue();
  resetMemoryUpdater();
  WorkspaceContextService.resetCache();
});

describe("memory updater", () => {
  it("persists a grounded candidate and queues it for the workspace file", () => {
    submit({
      subject: "payments:transport",
      statement: "Payments moved to gRPC.",
    });

    const result = drain();

    expect(result.accepted).toBe(1);
    expect(readRecords(WORKSPACE)).toHaveLength(1);
    expect(getPendingMirrorCount(WORKSPACE)).toBe(1);
  });

  it("drops an ungrounded candidate without persisting or mirroring it", () => {
    submit({
      subject: "payments:transport",
      statement: "Payments uses gRPC everywhere.",
      provenance: {
        source: "agent-claim",
        conversationId: "conv-1",
        observedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    const result = drain();

    expect(result.accepted).toBe(0);
    expect(result.rejectionReasons).toEqual(["ungrounded-agent-claim"]);
    expect(readRecords(WORKSPACE)).toEqual([]);
    expect(getPendingMirrorCount(WORKSPACE)).toBe(0);
  });

  it("supersedes an earlier version of the same claim", () => {
    submit({
      subject: "payments:transport",
      statement: "Payments uses REST.",
      provenance: {
        source: "user-decision",
        conversationId: "conv-1",
        observedAt: "2025-03-01T00:00:00.000Z",
      },
    });
    drain();

    submit({
      subject: "payments:transport",
      statement: "Payments moved to gRPC.",
      provenance: {
        source: "user-decision",
        conversationId: "conv-2",
        observedAt: "2026-03-01T00:00:00.000Z",
      },
    });
    const result = drain();

    expect(result.superseded).toBe(1);
    const records = readRecords(WORKSPACE);
    expect(records).toHaveLength(2);
    expect(records.filter((r) => r.status === "active")).toHaveLength(1);
    expect(records.filter((r) => r.status === "superseded")).toHaveLength(1);
  });

  it("invalidates the context cache after an accepted write", () => {
    const params = {
      workspaceId: WORKSPACE,
      task: "how does payments communicate",
      conversationId: "conv-1",
      tokenBudget: 2000,
      commitSha: "aaa",
    };
    submit({
      subject: "payments:transport",
      statement: "Payments moved to gRPC.",
    });
    drain();

    WorkspaceContextService.buildContext(params);
    expect(WorkspaceContextService.buildContext(params).fromCache).toBe(true);

    submit({
      subject: "build:test-command",
      statement: "The test command is npm test.",
    });
    drain();

    expect(WorkspaceContextService.buildContext(params).fromCache).toBe(false);
  });

  it("publishes activity without interrupting anyone", () => {
    const events: WorkspaceActivityEvent[] = [];
    setActivitySink((event) => events.push(event));

    submit({
      subject: "payments:transport",
      statement: "Payments moved to gRPC.",
    });
    drain();

    expect(events.map((event) => event.kind)).toContain("learned");
    expect(events.map((event) => event.kind)).toContain("cache-refreshed");
    events.forEach((event) => {
      expect(event.workspaceId).toBe(WORKSPACE);
      expect(event.summary).toMatch(/^Memory updater: /);
    });
  });

  it("ignores a candidate with no workspace", () => {
    submitMemoryCandidate({
      ...candidate({ subject: "s", statement: "A perfectly ordinary fact." }),
      workspaceId: "",
    });
    expect(drain().accepted).toBe(0);
  });
});
