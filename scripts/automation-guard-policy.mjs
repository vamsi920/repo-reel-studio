/**
 * The pure half of scripts/automation-guard.mjs: rolling-window spend and
 * the cancel/pause decisions a policy requires. Separate so the app can show
 * the same 24 h spend the guard enforces (src/utils/automation-guard-policy.ts
 * re-exports it) without pulling in node: modules.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
export const ACTIVE = new Set(["PENDING", "RUNNING"]);

/** @param {{ created_at?: string, started_at?: string }} run */
function runTime(run) {
  return Date.parse(run.created_at ?? run.started_at ?? "") || 0;
}

/**
 * Rolling-window spend: reported costs of runs that started inside the window
 * plus the live cost of runs still going. Returns the total and the time the
 * total will fall back under `cap` as old runs leave the window.
 *
 * @param {Array<{ id: string, status: string, cost?: number | null, created_at?: string, started_at?: string }>} runs
 * @param {Record<string, number>} liveCosts run id -> live accumulated cost
 * @param {number} now
 * @param {number | null} [cap]
 */
export function windowSpend(runs, liveCosts, now, cap = null) {
  const inWindow = runs
    .filter((run) => now - runTime(run) < DAY_MS)
    .map((run) => ({
      at: runTime(run),
      cost:
        ACTIVE.has(run.status) && typeof liveCosts[run.id] === "number"
          ? liveCosts[run.id]
          : typeof run.cost === "number"
            ? run.cost
            : 0,
    }))
    .sort((a, b) => a.at - b.at);
  const spent = inWindow.reduce((sum, entry) => sum + entry.cost, 0);
  let until = null;
  if (cap != null && spent >= cap) {
    let remaining = spent;
    for (const entry of inWindow) {
      remaining -= entry.cost;
      if (remaining < cap) {
        until = entry.at + DAY_MS;
        break;
      }
    }
  }
  return { spent, until };
}

/**
 * What a policy requires for one automation's recent runs.
 *
 * @param {{ daily_budget_usd?: number | null, max_runs_per_hour?: number | null, skip_overlapping_runs?: boolean } | undefined} policy
 * @param {Array<{ id: string, status: string, cost?: number | null, created_at?: string, started_at?: string }>} runs
 * @param {Record<string, number>} liveCosts
 * @param {number} now
 * @returns {{ cancel: Array<{ runId: string, reason: "budget" | "rate_limit" | "overlap" }>, pause: null | { reason: "budget", spent: number, until: number | null } }}
 */
export function decide(policy, runs, liveCosts, now) {
  /** @type {Array<{ runId: string, reason: "budget" | "rate_limit" | "overlap" }>} */
  const cancel = [];
  const cancelled = new Set();
  const add = (runId, reason) => {
    if (cancelled.has(runId)) return;
    cancelled.add(runId);
    cancel.push({ runId, reason });
  };
  if (!policy) return { cancel, pause: null };
  const active = runs
    .filter((run) => ACTIVE.has(run.status))
    .sort((a, b) => runTime(a) - runTime(b));

  let pause = null;
  const cap = policy.daily_budget_usd;
  if (typeof cap === "number" && cap >= 0) {
    const { spent, until } = windowSpend(runs, liveCosts, now, cap);
    if (spent >= cap) {
      pause = { reason: /** @type {const} */ ("budget"), spent, until };
      for (const run of active) add(run.id, "budget");
    }
  }

  const maxPerHour = policy.max_runs_per_hour;
  if (typeof maxPerHour === "number" && maxPerHour >= 0) {
    const counted = runs
      .filter(
        (run) =>
          now - runTime(run) < HOUR_MS &&
          run.status !== "SKIPPED" &&
          // Cancelled runs (by the user or by this guard) do not count, so
          // cancelling the excess never feeds back into the limit.
          run.status !== "CANCELLED",
      )
      .sort((a, b) => runTime(a) - runTime(b));
    counted.forEach((run, index) => {
      if (index >= maxPerHour && ACTIVE.has(run.status))
        add(run.id, "rate_limit");
    });
  }

  if (policy.skip_overlapping_runs) {
    const stillActive = active.filter((run) => !cancelled.has(run.id));
    for (const run of stillActive.slice(1)) add(run.id, "overlap");
  }
  return { cancel, pause };
}
