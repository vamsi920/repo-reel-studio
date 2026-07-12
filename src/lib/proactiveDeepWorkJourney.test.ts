import { describe, expect, it } from "vitest";

import { normalizeProactiveLinkedRun } from "@/lib/proactiveNormalize";

describe("deep-work journey normalization", () => {
  const rawJourney = {
    version: 1,
    prReady: true,
    stages: [
      { key: "research", label: "Research", status: "done", detail: "looked at token.ts" },
      { key: "brainstorm", label: "Brainstorm", status: "done", detail: "3 approaches" },
      { key: "verify", label: "Verify", status: "done", detail: "green" },
    ],
    approaches: [
      { id: "test-first", title: "Test-first", risk: "low", score: 0.95, rationale: "extend coverage" },
      { id: "minimal-fix", title: "Minimal fix", risk: "low", score: 0.92, rationale: "surgical" },
    ],
    attempts: [
      { index: 1, validationStatus: "failed", patchPresent: true, changedFiles: 2, approachTitle: "Minimal fix", prReady: false },
      { index: 2, validationStatus: "passed", patchPresent: true, changedFiles: 3, approachTitle: "Test-first", prReady: true },
    ],
    attemptsRun: 2,
    maxAttempts: 3,
    selected: { id: "test-first", title: "Test-first" },
    research: {
      summary: "Targeting token.ts",
      targetFile: "src/auth/token.ts",
      relatedFiles: ["src/auth/session.ts"],
      existingTests: ["src/auth/token.test.ts"],
      riskNotes: ["behavioural change"],
    },
  };

  it("passes a well-formed journey through with prReady", () => {
    const summary = normalizeProactiveLinkedRun({
      id: "run-1",
      status: "awaiting_review",
      hasPatch: true,
      prReady: true,
      journey: rawJourney,
    });

    expect(summary).not.toBeNull();
    expect(summary?.prReady).toBe(true);
    expect(summary?.journey?.stages).toHaveLength(3);
    expect(summary?.journey?.stages.at(-1)?.status).toBe("done");
    expect(summary?.journey?.attempts.at(-1)).toMatchObject({
      validationStatus: "passed",
      prReady: true,
      approachTitle: "Test-first",
    });
    expect(summary?.journey?.selected?.title).toBe("Test-first");
    expect(summary?.journey?.research.targetFile).toBe("src/auth/token.ts");
  });

  it("returns null journey when stages are absent", () => {
    const summary = normalizeProactiveLinkedRun({
      id: "run-2",
      status: "failed",
      journey: { version: 1, prReady: false },
    });
    expect(summary?.journey).toBeNull();
    expect(summary?.prReady).toBe(false);
  });

  it("tolerates a missing journey entirely", () => {
    const summary = normalizeProactiveLinkedRun({ id: "run-3", status: "queued" });
    expect(summary?.journey).toBeNull();
    expect(summary?.prReady).toBe(false);
  });
});
