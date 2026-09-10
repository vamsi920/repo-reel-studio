import { describe, expect, it } from "vitest";
import { runDetailRefetchInterval } from "#/hooks/query/use-agentops";
import type { AgentOpsRunDetail } from "#/api/agentops-service/agentops-service.types";

function detail(status: AgentOpsRunDetail["run"]["status"]): AgentOpsRunDetail {
  return {
    run: {
      runId: "run-1",
      workspaceId: "/workspace/project",
      agentName: "agent",
      task: "task",
      status,
      model: null,
      phase: "completed",
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: null,
      updatedAt: "2026-01-01T00:00:00.000Z",
      costUsd: 0,
      maxBudgetPerTask: null,
      tokens: {
        prompt: 0,
        completion: 0,
        cacheRead: 0,
        cacheWrite: 0,
        reasoning: 0,
        total: 0,
      },
      toolCallCount: 0,
      llmCallCount: 0,
      errorCount: 0,
      artifacts: [],
    },
    spans: [],
    audit: [],
    approvals: [],
  };
}

describe("runDetailRefetchInterval", () => {
  it("polls a live run at the live cadence, before and after the first load", () => {
    const live = runDetailRefetchInterval(detail("running"));
    expect(runDetailRefetchInterval(undefined)).toBe(live);
    expect(runDetailRefetchInterval(detail("paused"))).toBe(live);
    expect(runDetailRefetchInterval(detail("waiting_for_confirmation"))).toBe(
      live,
    );
    expect(runDetailRefetchInterval(detail("stuck"))).toBe(live);
    expect(runDetailRefetchInterval(detail("idle"))).toBe(live);
  });

  it("slows down once the run is finished or errored, but keeps polling", () => {
    const live = runDetailRefetchInterval(detail("running"));
    const finished = runDetailRefetchInterval(detail("finished"));
    // A finished conversation can be resumed by a new message, so it is
    // still polled — at the History cadence rather than the live one.
    expect(finished).toBeGreaterThan(live);
    expect(runDetailRefetchInterval(detail("error"))).toBe(finished);
  });
});
