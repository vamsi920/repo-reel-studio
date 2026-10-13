/**
 * Resumes automation runs that died on a transient LLM error.
 *
 * Benchmarked against Devin (case-studies/automations, scenario A5): a run
 * that was fixing a failing CI check hit Gemini's per-minute token quota
 * ("retry in 30s"). litellm reports that 429 as a BadRequestError, which the
 * SDK does not retry, so the conversation ended in error and the run was
 * marked FAILED after 86 s -- nothing was delivered. Resuming the same
 * conversation 30 s later finished the job: the fix was pushed and CI went
 * green.
 *
 * The conversation keeps the triggering event and everything the agent has
 * done so far, so resuming it (agent-server `POST /conversations/{id}/run`)
 * is safer than a new run: event-triggered automations cannot be re-dispatched
 * with their payload. The automation service never reopens a FAILED run
 * (`/runs/{id}/complete` answers 409), so the app reads the delivered result
 * from the conversation's RESULT line instead (useRunOutcome).
 *
 * Only errors that clear on their own are retried, at most MAX_ATTEMPTS times
 * per run, and only for runs that failed in the last RECOVERY_WINDOW_MS.
 * Dependency-free (node: builtins only), never throws out of tick().
 */

export const MAX_ATTEMPTS = 2;
export const RECOVERY_WINDOW_MS = 30 * 60 * 1000;
const DEFAULT_DELAY_S = 30;
const MAX_AUTOMATIONS = 100;
const RUNS_PER_AUTOMATION = 5;

const TRANSIENT_ERROR =
  /\b(429|rate[ _-]?limit|RESOURCE_EXHAUSTED|quota|overloaded|50[234]|UNAVAILABLE|timed? ?out|ServiceUnavailable|InternalServerError|APIConnectionError)\b/i;

/** True for LLM/provider errors that clear by themselves after a wait. */
export function isTransientError(detail) {
  return !!detail && TRANSIENT_ERROR.test(detail);
}

/** Seconds the provider asked us to wait, or a backoff that grows per attempt. */
export function recoveryDelaySeconds(detail, attempt) {
  const asked =
    /retry in ([\d.]+)\s*s/i.exec(detail ?? "") ??
    /"retryDelay"\s*:\s*"([\d.]+)s"/i.exec(detail ?? "");
  const backoff = DEFAULT_DELAY_S * 2 ** attempt;
  return asked ? Math.max(Math.ceil(Number(asked[1])) + 5, backoff) : backoff;
}

/**
 * @param {{
 *   automationUrl: string,
 *   agentUrl: string,
 *   key: string,
 *   state: Record<string, any>,
 *   save: () => void,
 *   fetchImpl?: typeof fetch,
 *   log?: { log: (message: string) => void, error: (message: string) => void },
 *   now?: () => number,
 * }} options
 */
export function createRunRecovery({
  automationUrl,
  agentUrl,
  key,
  state,
  save,
  fetchImpl = fetch,
  log = console,
  now = () => Date.now(),
}) {
  const headers = { "X-Session-API-Key": key };
  state.recovery ??= {};

  async function get(url) {
    const res = await fetchImpl(url, { headers });
    if (!res.ok) throw new Error(`GET ${url.split("?")[0]} -> ${res.status}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async function lastError(conversationId) {
    const page = await get(
      `${agentUrl}/api/conversations/${conversationId}/events/search?limit=5&sort_order=TIMESTAMP_DESC`,
    );
    const error = (page?.items ?? []).find(
      (e) => e.kind === "ConversationErrorEvent",
    );
    return error ? String(error.detail ?? error.code ?? "") : null;
  }

  async function consider(run) {
    const failedAt = Date.parse(run.completed_at ?? "");
    if (run.status !== "FAILED" || !run.conversation_id) return;
    if (!failedAt || now() - failedAt > RECOVERY_WINDOW_MS) return;
    const record = (state.recovery[run.id] ??= {
      attempts: 0,
      failedAt: run.completed_at,
    });
    if (record.done || record.attempts >= MAX_ATTEMPTS) return;

    const conversation = await get(
      `${agentUrl}/api/conversations/${run.conversation_id}`,
    );
    const status = conversation?.execution_status;
    if (status === "running") return;
    if (status !== "error") {
      // Finished after an earlier resume, or ended for a non-error reason.
      record.done = true;
      return;
    }
    const detail = await lastError(run.conversation_id);
    if (!isTransientError(detail)) {
      record.done = true;
      return;
    }
    const waitS = recoveryDelaySeconds(detail, record.attempts);
    const since = Date.parse(record.resumedAt ?? run.completed_at);
    if (now() - since < waitS * 1000) return;

    const res = await fetchImpl(
      `${agentUrl}/api/conversations/${run.conversation_id}/run`,
      { method: "POST", headers },
    );
    record.attempts += 1;
    record.resumedAt = new Date(now()).toISOString();
    log.log(
      `[run-recovery] run ${run.id.slice(0, 8)} failed on a transient error; resumed conversation ${run.conversation_id.slice(0, 8)} (attempt ${record.attempts}/${MAX_ATTEMPTS}) -> ${res.status}`,
    );
  }

  function prune() {
    for (const [id, record] of Object.entries(state.recovery)) {
      if (now() - Date.parse(record.failedAt) > RECOVERY_WINDOW_MS)
        delete state.recovery[id];
    }
  }

  async function tick() {
    try {
      const page = await get(
        `${automationUrl}/api/automation/v1?limit=${MAX_AUTOMATIONS}`,
      );
      for (const automation of page?.automations ?? page?.items ?? []) {
        try {
          const runs = await get(
            `${automationUrl}/api/automation/v1/${automation.id}/runs?limit=${RUNS_PER_AUTOMATION}`,
          );
          for (const run of runs?.runs ?? []) await consider(run);
        } catch (error) {
          log.error(`[run-recovery] ${automation.id}: ${error.message}`);
        }
      }
      prune();
      save();
    } catch (error) {
      log.error(`[run-recovery] ${error.message}`);
    }
  }

  return { tick };
}
