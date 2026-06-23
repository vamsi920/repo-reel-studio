import { describe, expect, it } from "vitest";

import {
  areAgentRunsListsEqual,
  areProactiveStatusesEqual,
  countActiveRuns,
} from "@/components/studio/agent-ops/shared/agentOpsListEquality";
import {
  makeProactiveCandidate,
  makeProactiveStatus,
} from "@/components/studio/agent-ops/test/proactiveTestFixtures";
import type { AgentRun } from "@/lib/agentRuns";

function makeRun(id: string, status: AgentRun["status"] = "running"): AgentRun {
  return {
    id,
    status,
    updatedAt: "2026-05-27T12:00:00.000Z",
    timeline: [{ at: "2026-05-27T12:00:00.000Z", stage: "run", title: "Running" }],
  } as AgentRun;
}

describe("agentOpsListEquality", () => {
  it("countActiveRuns ignores terminal runs", () => {
    expect(countActiveRuns([makeRun("a", "running"), makeRun("b", "awaiting_review")])).toBe(1);
  });

  it("areAgentRunsListsEqual compares status and timeline tail", () => {
    const left = [makeRun("a")];
    const right = [{ ...makeRun("a"), status: "awaiting_review" as const }];
    expect(areAgentRunsListsEqual(left, left)).toBe(true);
    expect(areAgentRunsListsEqual(left, right)).toBe(false);
  });

  it("areProactiveStatusesEqual ignores unchanged candidate snapshots", () => {
    const status = makeProactiveStatus({
      ready: 1,
      candidates: [makeProactiveCandidate("c1")],
    });
    expect(areProactiveStatusesEqual(status, { ...status, candidates: [...status.candidates] })).toBe(true);
  });
});
