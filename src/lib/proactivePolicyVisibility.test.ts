import { describe, expect, it } from "vitest";

import { normalizeProactiveCandidate, normalizeProactiveLinkedRun } from "@/lib/proactiveAgentOps";

describe("proactive policy visibility contracts", () => {
  it("normalizes linked run policy fields", () => {
    const linked = normalizeProactiveLinkedRun({
      id: "run-1",
      status: "awaiting_review",
      policyStatus: "blocked",
      policySummary: "PR promotion blocked: 2 policy violation(s).",
      policyViolations: ["Changed file .env matches denylist"],
      policyWarnings: [],
      prApprovalBlocked: true,
      prPromotionDiscouraged: true,
      sensitivePaths: [".env"],
      validation: { overallStatus: "passed", commands: [], notes: [] },
      changedFiles: [],
      diffStat: "",
      hasPatch: true,
      testMatrix: { suites: [], overallStatus: "not_run", totalDurationMs: 0, passRate: 0 },
      qualityGates: { recommendation: "review", allPassed: false, gates: [] },
      changeIntent: { hypothesis: null, evidenceSufficiency: null },
      timeline: [],
      evaluation: {},
    });

    expect(linked?.policyStatus).toBe("blocked");
    expect(linked?.prApprovalBlocked).toBe(true);
    expect(linked?.policyViolations).toHaveLength(1);
  });

  it("normalizes candidate-level policy propagation", () => {
    const candidate = normalizeProactiveCandidate({
      id: "c1",
      batchId: "b1",
      status: "review_ready",
      policyStatus: "warning",
      policySummary: "PR promotion discouraged: 1 sensitive-path warning(s).",
      policyWarnings: ["Sensitive path touched: src/auth/session.ts"],
      prPromotionDiscouraged: true,
      reviewMetadata: {
        policyBlockReasons: ["Sensitive path touched: src/auth/session.ts"],
      },
      linkedRun: {
        id: "run-1",
        status: "awaiting_review",
        policyStatus: "warning",
        policyWarnings: ["Sensitive path touched: src/auth/session.ts"],
        policyViolations: [],
        prPromotionDiscouraged: true,
        validation: { overallStatus: "passed", commands: [], notes: [] },
        changedFiles: [{ path: "src/auth/session.ts", additions: 1, deletions: 0, changedLines: 1, sensitive: true }],
        diffStat: "1 file changed",
        hasPatch: true,
        testMatrix: { suites: [], overallStatus: "not_run", totalDurationMs: 0, passRate: 0 },
        qualityGates: { recommendation: "review", allPassed: false, gates: [] },
        changeIntent: { hypothesis: "Auth tweak", evidenceSufficiency: "moderate" },
        timeline: [],
        evaluation: {},
      },
    });

    expect(candidate.policyStatus).toBe("warning");
    expect(candidate.prPromotionDiscouraged).toBe(true);
    expect(candidate.policyWarnings?.[0]).toContain("Sensitive path");
    expect(candidate.linkedRun?.policyStatus).toBe("warning");
  });

  it("surfaces policy violations on execution failure payload", () => {
    const candidate = normalizeProactiveCandidate({
      id: "c2",
      batchId: "b1",
      status: "needs_execution",
      executionFailure: {
        kind: "execution_error",
        label: "Executor error",
        reason: "Policy violations block review_ready",
        retryInstructions: ["Review policy output"],
        isNoPatch: false,
        isBackendCrash: true,
        policyStatus: "blocked",
        policyViolations: ["Validation command not on proactive allowlist: make install"],
        prApprovalBlocked: true,
      },
    });

    expect(candidate.executionFailure?.policyViolations).toHaveLength(1);
    expect(candidate.executionFailure?.prApprovalBlocked).toBe(true);
  });
});
