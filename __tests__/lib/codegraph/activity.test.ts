import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearCodeGraphActivitySubscribers,
  emitCodeGraphMilestone,
  subscribeToCodeGraphActivity,
  type WorkspaceActivityEvent,
} from "#/lib/codegraph/activity";

const CONTEXT = {
  workspaceId: "/workspace/acme",
  repositoryId: "acme/app",
  commitSha: "abc1234",
};

const NOW = "2026-01-01T00:00:00.000Z";

afterEach(() => {
  clearCodeGraphActivitySubscribers();
});

describe("emitCodeGraphMilestone", () => {
  it("emits the platform WorkspaceActivityEvent shape", () => {
    const event = emitCodeGraphMilestone(
      CONTEXT,
      { kind: "analysis.started" },
      NOW,
    );

    expect(event).toMatchObject({
      workspaceId: "/workspace/acme",
      source: "codegraph",
      kind: "analysis.started",
      status: "running",
      title: "CodeGraph: analyzing repository",
      entityType: "repository",
      entityId: "acme/app",
      metadata: { commitSha: "abc1234" },
      createdAt: NOW,
    });
    expect(event.id).toBeTruthy();
  });

  it("publishes to subscribers", () => {
    const seen: WorkspaceActivityEvent[] = [];
    subscribeToCodeGraphActivity((event) => seen.push(event));

    emitCodeGraphMilestone(CONTEXT, { kind: "analysis.started" }, NOW);
    emitCodeGraphMilestone(CONTEXT, { kind: "analysis.relationships" }, NOW);

    expect(seen.map((event) => event.title)).toEqual([
      "CodeGraph: analyzing repository",
      "CodeGraph: building relationships",
    ]);
  });

  it("stops publishing after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToCodeGraphActivity(listener);
    unsubscribe();

    emitCodeGraphMilestone(CONTEXT, { kind: "analysis.started" }, NOW);

    expect(listener).not.toHaveBeenCalled();
  });

  it("reports counts in the mapped milestone, not per-node events", () => {
    const event = emitCodeGraphMilestone(
      CONTEXT,
      { kind: "analysis.mapped", fileCount: 640, symbolCount: 2400 },
      NOW,
    );

    expect(event.title).toBe("CodeGraph: mapped 640 files and 2,400 symbols");
    expect(event.status).toBe("running");
  });

  it("completes with the subsystem count", () => {
    const event = emitCodeGraphMilestone(
      CONTEXT,
      { kind: "analysis.ready", subsystemCount: 8 },
      NOW,
    );

    expect(event).toMatchObject({
      status: "completed",
      title: "CodeGraph: graph ready",
      message: "8 subsystems",
      progress: 100,
    });
  });

  it("says so when the graph came from a reduced analysis", () => {
    const event = emitCodeGraphMilestone(
      CONTEXT,
      { kind: "analysis.ready", subsystemCount: 8, reduced: true },
      NOW,
    );

    expect(event.message).toBe("8 subsystems (reduced analysis)");
  });

  it("surfaces failures with their reason", () => {
    const event = emitCodeGraphMilestone(
      CONTEXT,
      { kind: "analysis.failed", reason: "node is not available" },
      NOW,
    );

    expect(event).toMatchObject({
      status: "failed",
      title: "CodeGraph: analysis failed",
      message: "node is not available",
    });
  });

  it("advances progress monotonically through the run", () => {
    const progress = (
      [
        { kind: "analysis.started" },
        { kind: "analysis.relationships" },
        { kind: "analysis.mapped", fileCount: 1, symbolCount: 1 },
        { kind: "analysis.ready", subsystemCount: 1 },
      ] as const
    ).map(
      (milestone) => emitCodeGraphMilestone(CONTEXT, milestone, NOW).progress!,
    );

    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(progress.at(-1)).toBe(100);
  });
});
