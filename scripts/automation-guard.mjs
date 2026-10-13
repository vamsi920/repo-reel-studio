/**
 * Spend caps, rate limits, overlap control and failure alerts for automations.
 *
 * Benchmarked against Devin (case-studies/automations, round 4): Devin lets
 * an automation carry a spend limit and a run-rate limit, and emails the
 * owner when a run fails. openhands-automation has none of that -- a
 * misbehaving trigger could start runs without bound, and a failed run at
 * 3 a.m. was only visible to someone who opened the app. This guard runs on
 * every GitHub event bridge tick (scripts/github-event-bridge.mjs), so it
 * works unattended, for every trigger type, whether or not a tab is open.
 *
 * Policies are frontend-owned settings on the agent-server, under
 * `misc_settings.automation_policies`:
 *
 *   {
 *     alerts: {
 *       on: "failures" | "all" | "off",
 *       desktop: boolean,
 *       webhook_url: string,                // Slack, Discord or any https URL
 *     },
 *     automations: {
 *       [automationId]: {
 *         daily_budget_usd: number | null,   // rolling 24 h, incl. live runs
 *         max_runs_per_hour: number | null,  // rolling 1 h
 *         skip_overlapping_runs: boolean,    // one run at a time
 *       },
 *     },
 *   }
 *
 * What the guard did is written back under `misc_settings.automation_guard`
 * (`paused`, `cancelled`) so the app can say why a run was cancelled or an
 * automation turned itself off. Enforcement uses only real controls: the
 * automation service's PATCH `enabled` and `POST /runs/{id}/cancel`. Spend
 * comes from the runtime's reported costs (run `cost`, and the conversation's
 * `accumulated_cost` while a run is live); a run that reported no cost is
 * never counted as free spend -- it is simply not counted.
 *
 * Alerts go to a desktop notification (macOS / Linux) and, when a webhook
 * URL is set, to that webhook (Slack and Discord payloads are recognised). A completed run whose RESULT line says
 * FAILED is a failure too: it ran, but did not deliver.
 *
 * Dependency-free (node: builtins only), never throws out of tick().
 */
import { spawn } from "node:child_process";
import {
  latestRunError,
  latestRunReport,
  parseRunOutcome,
} from "./automation-delivery-contract.mjs";
import { ACTIVE, decide } from "./automation-guard-policy.mjs";
import { MAX_ATTEMPTS } from "./automation-run-recovery.mjs";

export { decide, windowSpend } from "./automation-guard-policy.mjs";

const RUNS_PER_AUTOMATION = 50;
const QUIET_AFTER_MS = 2 * 60 * 60 * 1000;
const MAX_CANCELLED_NOTES = 200;

/** @param {string} text */
function escapeAppleScript(text) {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Best-effort desktop notification; never throws.
 * @param {string} title
 * @param {string} body
 */
export function notifyDesktop(title, body) {
  // Test stacks (mock-LLM E2E) turn desktop notifications off.
  if (process.env.NEODEVEX_DESKTOP_NOTIFICATIONS === "0") return;
  try {
    const child =
      process.platform === "darwin"
        ? spawn(
            "osascript",
            [
              "-e",
              `display notification "${escapeAppleScript(body)}" with title "${escapeAppleScript(title)}"`,
            ],
            { stdio: "ignore", detached: true },
          )
        : process.platform === "linux"
          ? spawn("notify-send", [title, body], {
              stdio: "ignore",
              detached: true,
            })
          : null;
    child?.on("error", () => {});
    child?.unref();
  } catch {
    // Notifications are a convenience; the app still shows the run.
  }
}

/**
 * Webhook body for the alert, in the shape the destination expects.
 * @param {string} url
 * @param {string} text
 * @param {Record<string, unknown>} details
 */
export function alertPayload(url, text, details) {
  if (/hooks\.slack\.com\//.test(url)) return { text };
  if (/discord(app)?\.com\/api\/webhooks\//.test(url)) return { content: text };
  return { text, ...details };
}

/**
 * @param {{
 *   automationUrl: string,
 *   agentUrl: string,
 *   key: string,
 *   appUrl?: string,
 *   state: Record<string, any>,
 *   save: () => void,
 *   fetchImpl?: typeof fetch,
 *   log?: { log: (message: string) => void, error: (message: string) => void },
 *   now?: () => number,
 *   desktop?: (title: string, body: string) => void,
 *   alertWebhookEnv?: string,
 * }} options
 */
export function createAutomationGuard({
  automationUrl,
  agentUrl,
  key,
  appUrl = "",
  state,
  save,
  fetchImpl = fetch,
  log = console,
  now = () => Date.now(),
  desktop = notifyDesktop,
  alertWebhookEnv = process.env.AUTOMATION_ALERT_WEBHOOK_URL ?? "",
}) {
  const headers = { "X-Session-API-Key": key };
  const guardState = (state.guard ??= {
    since: new Date(now()).toISOString(),
    alerted: [],
  });

  async function request(url, init = {}) {
    const res = await fetchImpl(url, {
      ...init,
      headers: {
        ...headers,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
    });
    if (!res.ok)
      throw new Error(
        `${init.method ?? "GET"} ${url.split("?")[0]} -> ${res.status}`,
      );
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async function readSettings() {
    const settings = await request(`${agentUrl}/api/settings`);
    return settings?.misc_settings ?? {};
  }

  /** Deep-merged into misc_settings; null deletes a key. */
  async function writeGuardNotes(diff) {
    await request(`${agentUrl}/api/settings`, {
      method: "PATCH",
      body: JSON.stringify({ misc_settings_diff: { automation_guard: diff } }),
    });
  }

  /**
   * Kept in the settings block rather than the secret store on purpose:
   * every stored secret is handed to every agent conversation, and the alert
   * channel is not something an agent needs. AUTOMATION_ALERT_WEBHOOK_URL in
   * the environment covers headless installs.
   */
  function webhookUrl(alerts) {
    const url = alerts.webhook_url || alertWebhookEnv || "";
    return /^https:\/\//.test(url) ? url : null;
  }

  async function liveCost(conversationId) {
    const conversation = await request(
      `${agentUrl}/api/conversations/${conversationId}`,
    ).catch(() => null);
    const metrics = conversation?.stats?.usage_to_metrics;
    if (!metrics || typeof metrics !== "object") return null;
    let total = 0;
    for (const entry of Object.values(metrics)) {
      if (typeof entry?.accumulated_cost === "number")
        total += entry.accumulated_cost;
    }
    return total;
  }

  /** What the run's conversation reported, and why it errored if it did. */
  async function readConversation(conversationId) {
    const page = await request(
      `${agentUrl}/api/conversations/${conversationId}/events/search?limit=20&sort_order=TIMESTAMP_DESC`,
    ).catch(() => null);
    const items = page?.items ?? [];
    return {
      outcome: parseRunOutcome(latestRunReport(items)),
      error: latestRunError(items),
    };
  }

  async function sendAlert(title, body, details, alerts) {
    if (alerts.desktop !== false) desktop(title, body);
    const url = webhookUrl(alerts);
    if (!url) return;
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(alertPayload(url, `*${title}*\n${body}`, details)),
      });
      if (!res.ok)
        log.error(`[automation-guard] alert webhook -> ${res.status}`);
    } catch (error) {
      log.error(
        `[automation-guard] alert webhook unreachable (${error.message})`,
      );
    }
  }

  function wasAlerted(id) {
    return guardState.alerted.includes(id);
  }

  function markAlerted(id) {
    guardState.alerted.push(id);
    if (guardState.alerted.length > 500) guardState.alerted.splice(0, 100);
  }

  /** A failed run is still being retried by automation-run-recovery. */
  function recovering(runId) {
    const record = state.recovery?.[runId];
    return !!record && !record.done && record.attempts < MAX_ATTEMPTS;
  }

  async function alertRuns(automation, runs, alerts) {
    const mode = alerts.on ?? "failures";
    if (mode === "off") return;
    const since = Date.parse(guardState.since);
    const link = appUrl ? `${appUrl}/automations/${automation.id}` : "";
    for (const run of runs) {
      const ended = Date.parse(run.completed_at ?? "");
      if (!ended || ended < since || wasAlerted(run.id)) continue;
      if (run.status === "FAILED" && recovering(run.id)) continue;

      let failure = null;
      let delivered = null;
      if (run.status === "FAILED") {
        // The service only records "Remote conversation ended with error";
        // the conversation says why (for example a missing model API key).
        const cause = run.conversation_id
          ? (await readConversation(run.conversation_id)).error
          : null;
        failure =
          cause?.summary ??
          ((run.error_detail ?? "").split("\n")[0] || "The run failed.");
      } else if (run.status === "COMPLETED" && run.conversation_id) {
        const { outcome } = await readConversation(run.conversation_id);
        if (outcome.kind === "failed") failure = outcome.reason;
        if (outcome.kind === "delivered") delivered = outcome.url;
      }
      if (!failure && mode !== "all") {
        markAlerted(run.id);
        continue;
      }
      const title = failure
        ? `Automation failed: ${automation.name}`
        : `Automation finished: ${automation.name}`;
      const cost =
        typeof run.cost === "number" ? ` · $${run.cost.toFixed(2)}` : "";
      const body = [failure ?? delivered ?? run.status.toLowerCase(), link]
        .filter(Boolean)
        .join("\n");
      await sendAlert(
        title,
        `${body}${cost}`,
        {
          automation: { id: automation.id, name: automation.name },
          run: {
            id: run.id,
            status: run.status,
            error: failure,
            delivered,
            cost: run.cost ?? null,
          },
          url: link || null,
        },
        alerts,
      );
      markAlerted(run.id);
      log.log(
        `[automation-guard] alerted: ${title} (run ${run.id.slice(0, 8)})`,
      );
    }
  }

  async function enforce(automation, runs, policy, notes, alerts) {
    const liveCosts = {};
    if (policy?.daily_budget_usd != null) {
      for (const run of runs) {
        if (ACTIVE.has(run.status) && run.conversation_id) {
          const cost = await liveCost(run.conversation_id);
          if (cost != null) liveCosts[run.id] = cost;
        }
      }
    }
    const { cancel, pause } = decide(policy, runs, liveCosts, now());
    const at = new Date(now()).toISOString();
    /** @type {Record<string, unknown>} */
    const cancelledNotes = {};
    for (const { runId, reason } of cancel) {
      try {
        await request(
          `${automationUrl}/api/automation/v1/runs/${runId}/cancel`,
          {
            method: "POST",
          },
        );
      } catch (error) {
        // 409: the run ended on its own in the meantime; nothing was cancelled.
        if (/-> 409/.test(error.message)) continue;
        throw error;
      }
      cancelledNotes[runId] = { reason, at, automation_id: automation.id };
      log.log(
        `[automation-guard] cancelled run ${runId.slice(0, 8)} of "${automation.name}" (${reason})`,
      );
    }

    const paused = notes.paused?.[automation.id];
    /** @type {Record<string, unknown>} */
    const pausedDiff = {};
    if (pause && automation.enabled) {
      await request(`${automationUrl}/api/automation/v1/${automation.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: false }),
      });
      const until = pause.until ? new Date(pause.until).toISOString() : null;
      pausedDiff[automation.id] = {
        reason: pause.reason,
        at,
        until,
        spent_usd: Number(pause.spent.toFixed(4)),
        budget_usd: policy?.daily_budget_usd ?? null,
      };
      if (alerts.on !== "off")
        await sendAlert(
          `Automation paused: ${automation.name}`,
          `Spent $${pause.spent.toFixed(2)} of its $${(policy?.daily_budget_usd ?? 0).toFixed(2)} daily budget.${until ? ` It turns back on at ${until}.` : ""}`,
          {
            automation: { id: automation.id, name: automation.name },
            paused: pausedDiff[automation.id],
          },
          alerts,
        );
      log.log(
        `[automation-guard] paused "${automation.name}": daily budget reached ($${pause.spent.toFixed(2)})`,
      );
    } else if (paused && !pause) {
      // Back under budget (or the budget was raised or removed). Resume only
      // what the guard itself paused; the app clears this note when the user
      // toggles the automation, so a manual "off" stays off.
      if (!automation.enabled) {
        await request(`${automationUrl}/api/automation/v1/${automation.id}`, {
          method: "PATCH",
          body: JSON.stringify({ enabled: true }),
        });
        log.log(
          `[automation-guard] resumed "${automation.name}": back under its daily budget`,
        );
      }
      pausedDiff[automation.id] = null;
    }

    return { cancelledNotes, pausedDiff };
  }

  function pruneCancelled(notes, added) {
    const all = { ...(notes.cancelled ?? {}), ...added };
    const ids = Object.keys(all);
    /** @type {Record<string, null>} */
    const removed = {};
    if (ids.length <= MAX_CANCELLED_NOTES) return removed;
    ids
      .sort((a, b) => Date.parse(all[a].at) - Date.parse(all[b].at))
      .slice(0, ids.length - MAX_CANCELLED_NOTES)
      .forEach((id) => {
        removed[id] = null;
      });
    return removed;
  }

  async function tick() {
    try {
      const misc = await readSettings();
      const policies = misc.automation_policies ?? {};
      const notes = misc.automation_guard ?? {};
      const alerts = policies.alerts ?? {};
      const page = await request(
        `${automationUrl}/api/automation/v1?limit=100`,
      );
      /** @type {Record<string, unknown>} */
      const cancelled = {};
      /** @type {Record<string, unknown>} */
      const paused = {};
      for (const automation of page?.automations ?? page?.items ?? []) {
        try {
          const policy = policies.automations?.[automation.id];
          const hasPolicy = !!policy || !!notes.paused?.[automation.id];
          if (!hasPolicy && alerts.on === "off") continue;
          // Without limits, only runs that can still end need reading: no
          // run lasts longer than the service's 30 min ceiling.
          const lastTriggered = Date.parse(automation.last_triggered_at ?? "");
          if (
            !hasPolicy &&
            !(lastTriggered && now() - lastTriggered < QUIET_AFTER_MS)
          )
            continue;
          const { runs = [] } =
            (await request(
              `${automationUrl}/api/automation/v1/${automation.id}/runs?limit=${RUNS_PER_AUTOMATION}`,
            )) ?? {};
          if (hasPolicy) {
            const result = await enforce(
              automation,
              runs,
              policy,
              notes,
              alerts,
            );
            Object.assign(cancelled, result.cancelledNotes);
            Object.assign(paused, result.pausedDiff);
          }
          await alertRuns(automation, runs, alerts);
        } catch (error) {
          log.error(`[automation-guard] ${automation.id}: ${error.message}`);
        }
      }
      if (Object.keys(cancelled).length || Object.keys(paused).length) {
        await writeGuardNotes({
          ...(Object.keys(paused).length ? { paused } : {}),
          cancelled: { ...cancelled, ...pruneCancelled(notes, cancelled) },
        });
      }
      save();
    } catch (error) {
      log.error(`[automation-guard] ${error.message}`);
    }
  }

  return { tick };
}
