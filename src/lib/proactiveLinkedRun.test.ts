import { describe, expect, it } from "vitest";

import { normalizeProactiveCandidate, normalizeProactiveLinkedRun } from "@/lib/proactiveAgentOps";

const REALISTIC_LINKED_RUN = {
  id: "run-proactive-01",
  status: "awaiting_review",
  updatedAt: "2026-05-27T12:00:00Z",
  validation: {
    overallStatus: "partial",
    commands: [
      {
        command: "npm test",
        exitCode: 1,
        stdout: "FAIL src/util.test.ts\n",
        stderr: "expected 1 to equal 2",
        durationMs: 900,
        kind: "validation",
      },
    ],
    notes: ["One validation command failed."],
  },
  changedFiles: [{ path: "src/util.ts", additions: 2, deletions: 1, changedLines: 3, sensitive: false }],
  diffStat: "1 file changed, 2 insertions(+), 1 deletion(-)",
  hasPatch: true,
  testMatrix: {
    suites: [
      {
        suite: "test",
        command: "npm test",
        status: "failed",
        durationMs: 900,
        exitCode: 1,
        failureSummary: "expected 1 to equal 2",
        impactedFiles: ["src/util.ts"],
        logRef: null,
      },
    ],
    overallStatus: "partial",
    totalDurationMs: 900,
    passRate: 0,
  },
  qualityGates: {
    recommendation: "review",
    allPassed: false,
    gates: [{ gate: "test", status: "failed", detail: "npm test" }],
  },
  changeIntent: {
    hypothesis: "Tighten timeout handling",
    evidenceSufficiency: "moderate",
  },
  timeline: [],
  evaluation: { confidenceScore: 0.7 },
};

describe("normalizeProactiveLinkedRun", () => {
  it("preserves validation artifacts and defaults null blocks", () => {
    const linked = normalizeProactiveLinkedRun(REALISTIC_LINKED_RUN);
    expect(linked).not.toBeNull();
    expect(linked?.validation.commands).toHaveLength(1);
    expect(linked?.validation.notes).toEqual(["One validation command failed."]);
    expect(linked?.changedFiles[0]?.path).toBe("src/util.ts");
    expect(linked?.testMatrix.suites).toHaveLength(1);
    expect(linked?.qualityGates.recommendation).toBe("review");
    expect(linked?.diffStat).toContain("1 file changed");
  });

  it("fills safe defaults when backend omits nested fields", () => {
    const linked = normalizeProactiveLinkedRun({ id: "run-empty", status: "running" });
    expect(linked?.validation.overallStatus).toBe("not_run");
    expect(linked?.validation.commands).toEqual([]);
    expect(linked?.changedFiles).toEqual([]);
    expect(linked?.testMatrix.suites).toEqual([]);
    expect(linked?.qualityGates.gates).toEqual([]);
    expect(linked?.changeIntent.hypothesis).toBeNull();
  });

  it("normalizes candidate linkedRun from status payload", () => {
    const candidate = normalizeProactiveCandidate({
      id: "c1",
      batchId: "b1",
      status: "review_ready",
      linkedRun: REALISTIC_LINKED_RUN,
    });
    expect(candidate.linkedRun?.testMatrix.passRate).toBe(0);
    expect(candidate.linkedRun?.validation.commands[0]?.stderr).toContain("expected 1");
  });
});
