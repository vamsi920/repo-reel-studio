import { describe, expect, it } from "vitest";
import { runDetailRefetchInterval } from "#/hooks/query/use-agentops";
import {
  AgentOpsRequestError,
  AgentOpsUnavailableError,
  isAgentOpsNotFoundError,
} from "#/api/agentops-service/agentops-service.api";
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
    expect(typeof live).toBe("number");
    expect(finished).toBeGreaterThan(live as number);
    expect(runDetailRefetchInterval(detail("error"))).toBe(finished);
  });

  it("stops polling a run the collector does not know, but keeps polling through an outage", () => {
    const live = runDetailRefetchInterval(detail("running"));
    const notFound = new AgentOpsRequestError(
      "/runs/does-not-exist",
      404,
      JSON.stringify({ error: "Unknown run does-not-exist" }),
    );
    // A 404 is final: re-asking every 3 s only fills the console.
    expect(runDetailRefetchInterval(undefined, notFound)).toBe(false);
    // Anything else — collector down, a 5xx, a 401 — is transient and the
    // detail page must recover on its own once the collector answers again.
    expect(
      runDetailRefetchInterval(
        undefined,
        new AgentOpsUnavailableError("not reachable"),
      ),
    ).toBe(live);
    expect(
      runDetailRefetchInterval(
        undefined,
        new AgentOpsRequestError("/runs/x", 500, "boom"),
      ),
    ).toBe(live);
    expect(runDetailRefetchInterval(undefined, null)).toBe(live);
  });
});

describe("isAgentOpsNotFoundError", () => {
  it("is true only for a collector 404", () => {
    expect(
      isAgentOpsNotFoundError(
        new AgentOpsRequestError("/runs/x", 404, '{"error":"Unknown run x"}'),
      ),
    ).toBe(true);
    expect(
      isAgentOpsNotFoundError(new AgentOpsRequestError("/runs/x", 500, "")),
    ).toBe(false);
    expect(
      isAgentOpsNotFoundError(new AgentOpsUnavailableError("down")),
    ).toBe(false);
    expect(isAgentOpsNotFoundError(new Error("404"))).toBe(false);
    expect(isAgentOpsNotFoundError(null)).toBe(false);
  });
});
