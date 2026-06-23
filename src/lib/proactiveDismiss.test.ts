import { describe, expect, it } from "vitest";
import {
  applyProactiveCandidatePatch,
  computeProactiveReadyCount,
  type ProactiveCandidate,
  type ProactiveStatus,
} from "@/lib/proactiveAgentOps";

const baseConfig = {
  repoUrl: "https://github.com/example/repo",
  enabled: true,
  targetCount: 4,
  qualityMode: "high",
  timezone: "UTC",
  morningDeadline: "09:00",
  updatedAt: "2026-01-01T00:00:00Z",
};

function candidate(id: string, status: string): ProactiveCandidate {
  return {
    id,
    batchId: "batch-1",
    repoUrl: baseConfig.repoUrl,
    status,
    type: "improvement",
    title: id,
    hypothesis: "test",
    evidence: [],
    score: { signal: 0.5, validation: 0.5, centrality: 0.5, risk: 0.5, total: 0.5 },
    dedupeKey: `${id}:improvement`,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("proactiveDismiss helpers", () => {
  it("computeProactiveReadyCount counts only review_ready", () => {
    const rows = [candidate("a", "review_ready"), candidate("b", "discovered"), candidate("c", "review_ready")];
    expect(computeProactiveReadyCount(rows)).toBe(2);
  });

  it("applyProactiveCandidatePatch removes dismissed and uses batch ready count", () => {
    const status: ProactiveStatus = {
      config: baseConfig,
      ready: 1,
      target: 4,
      candidates: [candidate("a", "review_ready"), candidate("b", "discovered")],
      batch: {
        id: "batch-1",
        date: "2026-01-01",
        status: "complete",
        targetCount: 4,
        progress: { discovered: 2, selected: 2, materialized: 1, ready: 0, dismissed: 1 },
        metrics: { qualityMode: "high", averageScore: 0.8 },
      },
    };

    const dismissed = { ...candidate("a", "review_ready"), status: "dismissed" };
    const next = applyProactiveCandidatePatch(status, dismissed, {
      removeFromList: true,
      batch: status.batch,
    });

    expect(next.candidates).toHaveLength(1);
    expect(next.candidates[0].id).toBe("b");
    expect(next.ready).toBe(0);
    expect(next.batch?.progress?.ready).toBe(0);
  });

  it("applyProactiveCandidatePatch keeps ready when approving non-dismissed update", () => {
    const status: ProactiveStatus = {
      config: baseConfig,
      ready: 1,
      target: 4,
      candidates: [candidate("a", "review_ready")],
    };
    const updated = { ...candidate("a", "review_ready"), title: "still ready" };
    const next = applyProactiveCandidatePatch(status, updated);
    expect(next.ready).toBe(1);
    expect(next.candidates[0].title).toBe("still ready");
  });
});
