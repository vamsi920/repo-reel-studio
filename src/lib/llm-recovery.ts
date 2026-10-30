/**
 * Recovery from one known provider quirk: Gemini (Vertex) sometimes answers
 * `400 INVALID_ARGUMENT - Request contains an invalid argument` to the request
 * that follows a parallel batch of tool calls when a client tool's receipt
 * arrives as a user message right after the tool results (seen in Neo Synth,
 * 2026-10-29/30). The history is not corrupt: one more user message and the
 * next request goes through. So instead of leaving the run dead with a red
 * banner, the app sends that message itself -- once per error event, a few
 * times per conversation at most, and only for errors that just happened.
 */

/** What the app sends to pick the run back up. Studios hide it. */
export const LLM_RECOVERY_MESSAGE =
  "The model provider rejected the last request (a transient error). Continue from where you stopped; do not repeat finished steps.";

export const MAX_RECOVERIES = 3;
export const RECOVERY_WINDOW_MS = 10 * 60_000;
/** Errors older than this came from history, not from the live run. */
export const RECENT_ERROR_MS = 2 * 60_000;

const INVALID_ARGUMENT =
  /INVALID_ARGUMENT|Request contains an invalid argument/i;

const STORAGE_PREFIX = "neo-llm-recovery:";

export function isRecoverableProviderRejection(
  detail: string | null | undefined,
): boolean {
  return Boolean(detail && INVALID_ARGUMENT.test(detail));
}

/**
 * Whether to send the recovery message for this error event. Pure: the
 * caller passes the timestamps of earlier recoveries for the conversation.
 */
export function shouldRecover({
  detail,
  errorAt,
  now,
  previous,
}: {
  detail: string | null | undefined;
  errorAt: number | null;
  now: number;
  previous: number[];
}): boolean {
  if (!isRecoverableProviderRejection(detail)) return false;
  if (errorAt !== null && now - errorAt > RECENT_ERROR_MS) return false;
  const recent = previous.filter((t) => now - t < RECOVERY_WINDOW_MS);
  return recent.length < MAX_RECOVERIES;
}

function readRecoveries(conversationId: string): number[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${conversationId}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((t): t is number => typeof t === "number")
      : [];
  } catch {
    return [];
  }
}

/**
 * Claims the right to recover from `eventId` (one tab, one time) and records
 * it. Returns false when another tab or an earlier render already did.
 */
function claim(conversationId: string, eventId: string, now: number): boolean {
  try {
    const key = `${STORAGE_PREFIX}event:${eventId}`;
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, String(now));
    const list = [...readRecoveries(conversationId), now].slice(-10);
    localStorage.setItem(
      `${STORAGE_PREFIX}${conversationId}`,
      JSON.stringify(list),
    );
    return true;
  } catch {
    // Storage blocked: still recover, the in-memory guard below dedupes.
    return true;
  }
}

const handledInMemory = new Set<string>();

/**
 * Agent-server event timestamps carry no zone; read them both as local
 * time and as UTC and keep the reading closest to now.
 */
export function eventTime(
  timestamp: string | null | undefined,
  now: number,
): number | null {
  if (!timestamp) return null;
  const readings = [
    Date.parse(timestamp),
    /[zZ]|[+-]\d\d:?\d\d$/.test(timestamp) ? NaN : Date.parse(`${timestamp}Z`),
  ].filter(Number.isFinite);
  if (readings.length === 0) return null;
  return readings.sort((a, b) => Math.abs(now - a) - Math.abs(now - b))[0];
}

export async function maybeRecoverFromProviderRejection(args: {
  conversationId: string;
  eventId: string;
  detail: string | null | undefined;
  timestamp: string | null | undefined;
  send: (text: string) => Promise<unknown>;
  now?: number;
}): Promise<boolean> {
  const now = args.now ?? Date.now();
  if (handledInMemory.has(args.eventId)) return false;
  if (
    !shouldRecover({
      detail: args.detail,
      errorAt: eventTime(args.timestamp, now),
      now,
      previous: readRecoveries(args.conversationId),
    })
  ) {
    return false;
  }
  handledInMemory.add(args.eventId);
  if (!claim(args.conversationId, args.eventId, now)) return false;
  try {
    await args.send(LLM_RECOVERY_MESSAGE);
    return true;
  } catch {
    return false;
  }
}
