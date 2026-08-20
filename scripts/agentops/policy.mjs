/**
 * Budget accounting and policy evaluation for the AgentOps Control Tower.
 *
 * Every figure here is derived from cost the runtime actually reported
 * (`ConversationStats.usage_to_metrics[*].accumulated_cost`, which comes from
 * the provider/LiteLLM usage metadata). Nothing is estimated from token counts
 * and a price table, because a made-up dollar figure in a governance surface is
 * worse than no figure at all: a run whose provider reports no cost contributes
 * 0 to spend and is counted separately as `runsWithoutCost`, so the UI can say
 * "no cost reported" instead of "free".
 *
 * Pure module — no IO, no clock of its own (callers pass `now`).
 */

import { isActiveStatus, isTerminalStatus } from "./map-events.mjs";

/** Start of the UTC month containing `now`. */
export function monthStart(now) {
  const date = new Date(now);
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
  ).toISOString();
}

/** Start of the UTC day containing `now`. */
export function dayStart(now) {
  const date = new Date(now);
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  ).toISOString();
}

function within(run, sinceIso) {
  return new Date(run.updatedAt).getTime() >= new Date(sinceIso).getTime();
}

/**
 * Spend for a slice of runs.
 *
 * @returns {{usedUsd: number, runCount: number, runsWithoutCost: number,
 *            tokens: number}}
 */
export function computeSpend(runs, { workspaceId, agentName, since } = {}) {
  let usedUsd = 0;
  let tokens = 0;
  let runCount = 0;
  let runsWithoutCost = 0;

  for (const run of runs) {
    if (workspaceId && run.workspaceId !== workspaceId) continue;
    if (agentName && run.agentName !== agentName) continue;
    if (since && !within(run, since)) continue;
    runCount += 1;
    tokens += run.tokens?.total ?? 0;
    if (typeof run.costUsd === "number" && run.costUsd > 0)
      usedUsd += run.costUsd;
    else runsWithoutCost += 1;
  }

  return { usedUsd, runCount, runsWithoutCost, tokens };
}

/**
 * Straight-line run-rate projection of month-end spend.
 *
 * This is explicitly a projection of the current burn rate, not a forecast and
 * not a bill; the UI labels it that way. Returns null before enough of the
 * month has elapsed to make the extrapolation meaningful.
 */
export function projectMonthlySpend(usedUsd, now) {
  const start = new Date(monthStart(now)).getTime();
  const current = new Date(now).getTime();
  const elapsedMs = current - start;
  const oneHour = 60 * 60 * 1000;
  if (elapsedMs < oneHour) return null;

  const nextMonth = new Date(start);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const monthMs = nextMonth.getTime() - start;
  return (usedUsd / elapsedMs) * monthMs;
}

const RISK_ORDER = { UNKNOWN: -1, LOW: 0, MEDIUM: 1, HIGH: 2 };

/** True when `risk` meets or exceeds the policy's approval threshold. */
export function meetsRiskThreshold(risk, threshold) {
  const actual = RISK_ORDER[String(risk).toUpperCase()];
  const wanted = RISK_ORDER[String(threshold).toUpperCase()];
  if (actual === undefined || wanted === undefined) return false;
  return actual >= wanted;
}

/**
 * Evaluate every budget that applies to a run.
 *
 * @returns {{breaches: Array, warnings: Array}} `breaches` mean "stop this
 *   run"; `warnings` are threshold crossings that are only reported.
 */
export function evaluateBudgets({
  run,
  policy,
  agentBudgetUsd,
  workspaceSpend,
  agentSpend,
}) {
  const breaches = [];
  const warnings = [];

  const runCost = typeof run.costUsd === "number" ? run.costUsd : 0;

  if (
    typeof policy.runBudgetUsd === "number" &&
    runCost >= policy.runBudgetUsd
  ) {
    breaches.push({
      scope: "run",
      limitUsd: policy.runBudgetUsd,
      usedUsd: runCost,
      message: `Run reached its $${policy.runBudgetUsd.toFixed(2)} budget (spent $${runCost.toFixed(4)}).`,
    });
  }

  if (typeof agentBudgetUsd === "number" && agentSpend >= agentBudgetUsd) {
    breaches.push({
      scope: "agent",
      limitUsd: agentBudgetUsd,
      usedUsd: agentSpend,
      message: `Agent "${run.agentName}" reached its $${agentBudgetUsd.toFixed(2)} monthly budget.`,
    });
  }

  if (typeof policy.monthlyBudgetUsd === "number") {
    const limit = policy.monthlyBudgetUsd;
    if (workspaceSpend >= limit) {
      breaches.push({
        scope: "workspace",
        limitUsd: limit,
        usedUsd: workspaceSpend,
        message: `Workspace reached its $${limit.toFixed(2)} monthly budget.`,
      });
    } else {
      const pct = (workspaceSpend / limit) * 100;
      const crossed = (policy.warnThresholdPct ?? [])
        .filter((threshold) => pct >= threshold)
        .sort((a, b) => b - a)[0];
      if (crossed !== undefined) {
        warnings.push({
          scope: "workspace",
          thresholdPct: crossed,
          limitUsd: limit,
          usedUsd: workspaceSpend,
          message: `Workspace is at ${pct.toFixed(0)}% of its $${limit.toFixed(2)} monthly budget.`,
        });
      }
    }
  }

  return { breaches, warnings };
}

/** Whether a tool call is allowed by policy. `null` allowedTools means "all". */
export function isToolAllowed(toolName, policy) {
  if (!policy?.allowedTools) return true;
  if (!Array.isArray(policy.allowedTools)) return true;
  return policy.allowedTools.includes(toolName);
}

/**
 * Whether runs in this workspace should be started with the runtime's
 * confirmation mode on. This is the only real, agent-blocking approval
 * mechanism available, so autonomy level maps directly onto it.
 */
export function requiresConfirmationMode(policy) {
  return (
    policy?.autonomyLevel === "supervised" ||
    policy?.autonomyLevel === "assisted"
  );
}

/** The Overview tiles. All counts derived from stored runs, never invented. */
export function summarize(runs, approvals, now) {
  const since = dayStart(now);
  const today = runs.filter((run) => within(run, since));
  const spendToday = computeSpend(runs, { since });

  return {
    activeAgents: new Set(
      runs
        .filter((run) => isActiveStatus(run.status))
        .map((run) => run.agentName),
    ).size,
    activeRuns: runs.filter((run) => isActiveStatus(run.status)).length,
    runsToday: today.length,
    waitingForApproval: approvals.filter((a) => a.state === "pending").length,
    failures: today.filter(
      (run) =>
        run.status === "error" ||
        (isTerminalStatus(run.status) && run.errorCount > 0),
    ).length,
    tokensToday: spendToday.tokens,
    costTodayUsd: spendToday.usedUsd,
    runsTodayWithoutReportedCost: spendToday.runsWithoutCost,
    generatedAt: now,
  };
}
