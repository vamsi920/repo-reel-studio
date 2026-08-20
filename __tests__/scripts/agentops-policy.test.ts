import { describe, expect, it } from "vitest";

import {
  computeSpend,
  dayStart,
  evaluateBudgets,
  isToolAllowed,
  meetsRiskThreshold,
  monthStart,
  projectMonthlySpend,
  requiresConfirmationMode,
  summarize,
} from "../../scripts/agentops/policy.mjs";

const NOW = "2026-01-15T12:00:00.000Z";

function run(overrides: Record<string, unknown> = {}) {
  return {
    runId: "run-1",
    workspaceId: "/workspace/project",
    agentName: "OpenHands Agent",
    status: "running",
    costUsd: 1,
    errorCount: 0,
    tokens: { total: 1000 },
    updatedAt: NOW,
    ...overrides,
  };
}

describe("period boundaries", () => {
  it("computes UTC month and day starts", () => {
    expect(monthStart(NOW)).toBe("2026-01-01T00:00:00.000Z");
    expect(dayStart(NOW)).toBe("2026-01-15T00:00:00.000Z");
  });
});

describe("computeSpend", () => {
  it("sums only real reported cost and counts runs that reported none", () => {
    const spend = computeSpend([
      run({ runId: "a", costUsd: 1.5 }),
      run({ runId: "b", costUsd: 0 }),
      run({ runId: "c", costUsd: 2.5, workspaceId: "/other" }),
    ]);
    expect(spend.usedUsd).toBe(4);
    expect(spend.runCount).toBe(3);
    expect(spend.runsWithoutCost).toBe(1);
  });

  it("filters by workspace, agent and period", () => {
    const runs = [
      run({ runId: "a", costUsd: 1 }),
      run({ runId: "b", costUsd: 3, workspaceId: "/other" }),
      run({ runId: "c", costUsd: 5, updatedAt: "2025-12-01T00:00:00.000Z" }),
    ];
    expect(
      computeSpend(runs, {
        workspaceId: "/workspace/project",
        since: monthStart(NOW),
      }).usedUsd,
    ).toBe(1);
    expect(computeSpend(runs, { agentName: "OpenHands Agent" }).usedUsd).toBe(
      9,
    );
  });
});

describe("projectMonthlySpend", () => {
  it("extrapolates the current burn rate to month end", () => {
    // 14 days elapsed of a 31-day month, $14 spent → ~$31 projected.
    const projected = projectMonthlySpend(14, "2026-01-15T00:00:00.000Z");
    expect(projected).toBeCloseTo(31, 1);
  });

  it("returns null before an hour of the month has elapsed", () => {
    expect(projectMonthlySpend(5, "2026-01-01T00:30:00.000Z")).toBeNull();
  });
});

describe("evaluateBudgets", () => {
  const policy = {
    monthlyBudgetUsd: 100,
    runBudgetUsd: 2,
    warnThresholdPct: [50, 80, 100],
  };

  it("breaches the run budget when the run's real cost reaches it", () => {
    const { breaches } = evaluateBudgets({
      run: run({ costUsd: 2 }),
      policy,
      agentBudgetUsd: null,
      workspaceSpend: 10,
      agentSpend: 10,
    });
    expect(breaches).toHaveLength(1);
    expect(breaches[0].scope).toBe("run");
  });

  it("warns at the highest crossed workspace threshold without breaching", () => {
    const { breaches, warnings } = evaluateBudgets({
      run: run({ costUsd: 0.5 }),
      policy,
      agentBudgetUsd: null,
      workspaceSpend: 85,
      agentSpend: 0,
    });
    expect(breaches).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].thresholdPct).toBe(80);
  });

  it("breaches the workspace budget at 100% and stops warning", () => {
    const { breaches, warnings } = evaluateBudgets({
      run: run({ costUsd: 0.5 }),
      policy,
      agentBudgetUsd: null,
      workspaceSpend: 100,
      agentSpend: 0,
    });
    expect(breaches.map((b: { scope: string }) => b.scope)).toContain(
      "workspace",
    );
    expect(warnings).toHaveLength(0);
  });

  it("breaches an agent budget independently of the workspace budget", () => {
    const { breaches } = evaluateBudgets({
      run: run({ costUsd: 0.1 }),
      policy: {
        monthlyBudgetUsd: null,
        runBudgetUsd: null,
        warnThresholdPct: [],
      },
      agentBudgetUsd: 20,
      workspaceSpend: 5,
      agentSpend: 25,
    });
    expect(breaches).toHaveLength(1);
    expect(breaches[0].scope).toBe("agent");
  });

  it("never breaches when no budget is configured", () => {
    const { breaches, warnings } = evaluateBudgets({
      run: run({ costUsd: 999 }),
      policy: {
        monthlyBudgetUsd: null,
        runBudgetUsd: null,
        warnThresholdPct: [],
      },
      agentBudgetUsd: null,
      workspaceSpend: 999,
      agentSpend: 999,
    });
    expect(breaches).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });
});

describe("policy helpers", () => {
  it("maps risk levels onto the approval threshold", () => {
    expect(meetsRiskThreshold("HIGH", "MEDIUM")).toBe(true);
    expect(meetsRiskThreshold("LOW", "HIGH")).toBe(false);
    expect(meetsRiskThreshold("nonsense", "HIGH")).toBe(false);
  });

  it("treats a null allowedTools list as allow-all", () => {
    expect(isToolAllowed("execute_bash", { allowedTools: null })).toBe(true);
    expect(isToolAllowed("execute_bash", { allowedTools: ["glob"] })).toBe(
      false,
    );
    expect(isToolAllowed("glob", { allowedTools: ["glob"] })).toBe(true);
  });

  it("turns confirmation mode on for anything short of full autonomy", () => {
    expect(requiresConfirmationMode({ autonomyLevel: "supervised" })).toBe(
      true,
    );
    expect(requiresConfirmationMode({ autonomyLevel: "assisted" })).toBe(true);
    expect(requiresConfirmationMode({ autonomyLevel: "autonomous" })).toBe(
      false,
    );
  });
});

describe("summarize", () => {
  it("derives the overview tiles from stored runs and approvals", () => {
    const runs = [
      run({
        runId: "a",
        status: "running",
        costUsd: 1,
        tokens: { total: 100 },
      }),
      run({
        runId: "b",
        status: "finished",
        costUsd: 2,
        tokens: { total: 200 },
        agentName: "Other Agent",
      }),
      run({ runId: "c", status: "error", costUsd: 0, tokens: { total: 0 } }),
      run({
        runId: "d",
        status: "finished",
        costUsd: 5,
        updatedAt: "2025-12-01T00:00:00.000Z",
      }),
    ];
    const summary = summarize(
      runs,
      [{ state: "pending" }, { state: "approved" }],
      NOW,
    );

    expect(summary.activeAgents).toBe(1);
    expect(summary.runsToday).toBe(3);
    expect(summary.waitingForApproval).toBe(1);
    expect(summary.failures).toBe(1);
    expect(summary.tokensToday).toBe(300);
    expect(summary.costTodayUsd).toBe(3);
    // The zero-cost errored run is reported, not silently treated as free.
    expect(summary.runsTodayWithoutReportedCost).toBe(1);
  });
});
