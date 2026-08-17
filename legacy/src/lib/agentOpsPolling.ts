export const PROACTIVE_POLL_ACTIVE_MS = 2000;
export const PROACTIVE_POLL_IDLE_MS = 8000;
export const RUNS_POLL_ACTIVE_MS = 3200;
export const POLL_BACKOFF_BASE_MS = 3000;
export const POLL_BACKOFF_MAX_MS = 30000;

export type PollIntervalInput = {
  backendUnavailable: boolean;
  consecutiveFailures: number;
  workActive: boolean;
};

export function computeProactivePollIntervalMs(input: PollIntervalInput): number {
  if (input.backendUnavailable && input.consecutiveFailures > 0) {
    const exponent = Math.min(Math.max(input.consecutiveFailures - 1, 0), 4);
    return Math.min(POLL_BACKOFF_MAX_MS, POLL_BACKOFF_BASE_MS * 2 ** exponent);
  }
  return input.workActive ? PROACTIVE_POLL_ACTIVE_MS : PROACTIVE_POLL_IDLE_MS;
}

export function computeRunsPollIntervalMs(input: PollIntervalInput): number {
  if (input.backendUnavailable && input.consecutiveFailures > 0) {
    const exponent = Math.min(Math.max(input.consecutiveFailures - 1, 0), 4);
    return Math.min(POLL_BACKOFF_MAX_MS, POLL_BACKOFF_BASE_MS * 2 ** exponent);
  }
  return RUNS_POLL_ACTIVE_MS;
}

export type SerialTaskResult<T> =
  | { status: "completed"; value: T }
  | { status: "skipped" }
  | { status: "error"; error: unknown };

export function createSerialTaskRunner() {
  let inFlight = false;

  const run = async <T>(task: () => Promise<T>): Promise<SerialTaskResult<T>> => {
    if (inFlight) {
      return { status: "skipped" };
    }

    inFlight = true;
    try {
      const value = await task();
      return { status: "completed", value };
    } catch (error) {
      return { status: "error", error };
    } finally {
      inFlight = false;
    }
  };

  return {
    run,
    isInFlight: () => inFlight,
  };
}

export function nextFailureCount(previous: number, succeeded: boolean): number {
  if (succeeded) return 0;
  return Math.min(previous + 1, 8);
}
