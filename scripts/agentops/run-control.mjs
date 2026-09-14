/**
 * Run controls (Pause / Resume / Stop) and the truth about what they do.
 *
 * The Control Tower only ever forwards to the runtime's own `/interrupt` and
 * `/run`, and the runtime answers 200 to both regardless of whether anything
 * changed. This module is what stops a 200 from being mistaken for "done":
 * before a control is forwarded, the conversation's *live* `execution_status`
 * is read and checked against what `LocalConversation` in software-agent-sdk
 * will actually do with it —
 *
 * - `pause()` only moves IDLE/RUNNING to PAUSED; every other state is ignored.
 * - `interrupt()` cancels an in-flight `arun()` task, else falls back to
 *   `pause()` — so on a halted conversation it too is ignored.
 * - `run()` restarts IDLE/PAUSED/ERROR/STUCK, but the stuck detector inspects
 *   every event since the last user message, so a STUCK conversation re-trips
 *   it on the first iteration and is back to STUCK within milliseconds. Only a
 *   new user message (`send_message`) resets STUCK, exactly like FINISHED.
 *
 * A control the runtime will ignore is refused with a plain explanation and
 * leaves no audit row: an audit trail that says "cancelled" about a run that
 * is still there is worse than none.
 *
 * Pure decision + a thin orchestration over injected `client`/`store`, so it
 * is unit-testable without a network call.
 */

import { normalizeRunStatus } from "./map-events.mjs";

/** Message for a control the runtime ignores in the given state. */
const REFUSALS = {
  stuck:
    "The runtime halted this run because the agent kept repeating itself " +
    "(stuck detection). Pause, Stop and Resume have no effect on a stuck run — " +
    "send the conversation a new message to continue it, or leave it halted.",
  finished: "This run has already finished; there is nothing to {action}.",
  error: "This run already ended in an error; there is nothing to {action}.",
};

/**
 * Decide whether the runtime will honour `action` for a conversation whose
 * live status is `executionStatus`.
 *
 * @param {"pause" | "resume" | "cancel"} action
 * @param {string | null | undefined} executionStatus raw agent-server value
 * @returns {{ ok: true, status: string } | { ok: false, status: string, reason: string }}
 */
export function evaluateRunControl(action, executionStatus) {
  const status = normalizeRunStatus(executionStatus);

  if (status === "stuck") return { ok: false, status, reason: REFUSALS.stuck };

  if (action === "resume") {
    if (status === "running") {
      return {
        ok: false,
        status,
        reason: "This run is already running.",
      };
    }
    if (status === "finished") {
      return {
        ok: false,
        status,
        reason: REFUSALS.finished.replace("{action}", "resume"),
      };
    }
    return { ok: true, status };
  }

  // pause / cancel — both are `/interrupt` on the runtime.
  if (action === "pause" && status === "paused") {
    return { ok: false, status, reason: "This run is already paused." };
  }
  if (status === "finished" || status === "error") {
    return {
      ok: false,
      status,
      reason: REFUSALS[status].replace(
        "{action}",
        action === "cancel" ? "stop" : action,
      ),
    };
  }
  return { ok: true, status };
}

/** Thrown by `controlRun` when the request cannot be served; carries an HTTP status. */
export class RunControlError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.name = "RunControlError";
    this.status = status;
    Object.assign(this, extra);
  }
}

/**
 * Forward one control to the runtime and record it — only if it will act.
 *
 * Reads the conversation's live status from the runtime rather than the
 * store's copy (which is up to one poll interval stale) so a click on a
 * just-halted run is judged against what the runtime actually holds now.
 *
 * @returns {Promise<{ ok: true, action: string, runId: string, status: string }>}
 * @throws {RunControlError} 404 unknown run, 409 control the runtime ignores
 */
export async function controlRun({ client, store, runId, action, now }) {
  const run = await store.getRun(runId);
  if (!run) throw new RunControlError(404, `Unknown run ${runId}`);

  const conversation = await client.getConversation(runId).catch((error) => {
    if (error?.status === 404) {
      throw new RunControlError(
        409,
        "The runtime no longer has this conversation, so it cannot be " +
          `${action === "cancel" ? "stopped" : `${action}d`}.`,
        { runtimeStatus: null },
      );
    }
    throw error;
  });

  const verdict = evaluateRunControl(action, conversation?.execution_status);
  if (!verdict.ok) {
    throw new RunControlError(409, verdict.reason, {
      runtimeStatus: verdict.status,
    });
  }

  // These call the runtime for real. `pause` and `cancel` both map to
  // `/interrupt`, which is what actually halts in-flight work on a local
  // agent-server; `cancel` differs in that the UI requires a confirmation
  // first and the audit records it as an operator cancellation.
  if (action === "resume") await client.runConversation(runId);
  else await client.interruptConversation(runId);

  await store.appendAudit({
    at: now,
    actor: "user",
    action: action === "resume" ? "run.resumed" : `run.${action}`,
    summary:
      action === "resume"
        ? "Run resumed from the Control Tower"
        : `Run ${action === "cancel" ? "cancelled" : "paused"} from the Control Tower`,
    entityType: "run",
    entityId: runId,
    workspaceId: run.workspaceId,
  });

  return { ok: true, action, runId, status: verdict.status };
}

/**
 * Resume a run after a budget approval was granted — if the runtime will
 * actually take it. Returns what happened so the approval's audit row can say
 * so instead of implying the run is going again.
 *
 * @returns {Promise<{ resumed: boolean, status: string | null, reason: string | null }>}
 */
export async function resumeAfterApproval({ client, runId }) {
  let conversation;
  try {
    conversation = await client.getConversation(runId);
  } catch (error) {
    if (error?.status !== 404) throw error;
    return {
      resumed: false,
      status: null,
      reason: "The runtime no longer has this conversation.",
    };
  }
  const verdict = evaluateRunControl("resume", conversation?.execution_status);
  if (!verdict.ok) {
    return { resumed: false, status: verdict.status, reason: verdict.reason };
  }
  await client.runConversation(runId);
  return { resumed: true, status: verdict.status, reason: null };
}
