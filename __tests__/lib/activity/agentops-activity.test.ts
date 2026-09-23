import { describe, expect, it } from "vitest";
import { toWorkspaceActivityEvent } from "#/lib/activity/agentops-activity";
import type { AgentOpsAuditRecord } from "#/api/agentops-service/agentops-service.types";

function record(
  overrides: Partial<AgentOpsAuditRecord>,
): AgentOpsAuditRecord {
  return {
    id: "audit-1",
    at: "2026-01-01T00:00:00.000Z",
    actor: "user",
    action: "run.pause",
    summary: "Run paused from the Control Tower",
    entityType: "run",
    entityId: "run-1",
    workspaceId: "/workspace/project",
    ...overrides,
  };
}

describe("toWorkspaceActivityEvent", () => {
  // Regression: run-control.mjs's audit action for a user clicking Pause is
  // "run.pause" (present tense), not the collector's own budget-halt
  // "run.paused" — the same split "run.cancel" (user Stop) vs. "run.cancelled"
  // (auto-closed) already has an entry for each. FEED_ACTIONS only mapped
  // "run.paused", so a user's own Pause silently never reached the workspace
  // activity feed at all.
  it("surfaces a user-initiated pause, not just the collector's own", () => {
    const userPause = toWorkspaceActivityEvent(record({ action: "run.pause" }));
    const systemPause = toWorkspaceActivityEvent(
      record({ action: "run.paused" }),
    );

    expect(userPause).not.toBeNull();
    expect(systemPause).not.toBeNull();
    expect(userPause?.status).toBe(systemPause?.status);
  });

  // Regression: collector.mjs's #closeOrphanedRuns writes "run.cancelled"
  // (past tense) when a run's conversation was deleted out from under it;
  // run-control.mjs writes "run.cancel" (present tense) for a user clicking
  // Stop. FEED_ACTIONS only mapped "run.cancel", so an auto-closed run's
  // halt silently never reached the workspace activity feed.
  it("surfaces an auto-closed/orphaned run's cancellation, not just a user's Stop", () => {
    const userCancel = toWorkspaceActivityEvent(
      record({ action: "run.cancel" }),
    );
    const autoCancelled = toWorkspaceActivityEvent(
      record({ action: "run.cancelled" }),
    );

    expect(userCancel).not.toBeNull();
    expect(autoCancelled).not.toBeNull();
    expect(autoCancelled?.status).toBe(userCancel?.status);
  });

  it("drops a record whose action has no feed mapping", () => {
    expect(toWorkspaceActivityEvent(record({ action: "tool.called" }))).toBeNull();
  });

  // Regression: map-events.mjs's applyStatus() emits "task.stuck" exactly
  // once per run, the same as "task.completed"/"task.failed" it transitions
  // alongside, when the runtime's loop detector halts the agent — and
  // policy.mjs's summarize() counts "stuck" as a failure right next to
  // "error". FEED_ACTIONS mapped "task.failed" but not "task.stuck", so a
  // stuck run's halt silently never reached the workspace activity feed.
  it("surfaces a stuck run as a failure, the same as an errored one", () => {
    const stuck = toWorkspaceActivityEvent(record({ action: "task.stuck" }));
    const failed = toWorkspaceActivityEvent(record({ action: "task.failed" }));

    expect(stuck).not.toBeNull();
    expect(stuck?.status).toBe("failed");
    expect(stuck?.status).toBe(failed?.status);
  });
});
