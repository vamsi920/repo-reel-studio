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

  it("drops a record whose action has no feed mapping", () => {
    expect(toWorkspaceActivityEvent(record({ action: "tool.called" }))).toBeNull();
  });
});
