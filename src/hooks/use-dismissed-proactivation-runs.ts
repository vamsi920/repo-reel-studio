import { useLocalStorage } from "@uidotdev/usehooks";
import { useCallback, useMemo } from "react";

export const DISMISSED_PROACTIVATION_RUNS_KEY =
  "oh:dismissed-proactivation-runs";

/**
 * Upper bound on how many dismissed run ids we keep in localStorage. Without
 * a cap, a long-lived install would grow this array forever; the oldest
 * entries (least likely to still be rendered) are dropped first.
 */
const MAX_TRACKED_DISMISSED_RUNS = 500;

function sanitizeDismissedRunIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !entry || seen.has(entry)) continue;
    seen.add(entry);
    next.push(entry);
  }
  return next;
}

/**
 * Tracks which Proactivation-suggestion run ids the user has dismissed,
 * persisted in localStorage so the "Dismiss"/"Create PR" actions on a
 * completed run don't reappear after a navigation or reload -- a plain
 * `useState` only suppresses them for the current mounted row instance.
 */
export function useDismissedProactivationRuns() {
  const [rawDismissedIds, setRawDismissedIds] = useLocalStorage<string[]>(
    DISMISSED_PROACTIVATION_RUNS_KEY,
    [],
  );

  const dismissedIds = useMemo(
    () => sanitizeDismissedRunIds(rawDismissedIds),
    [rawDismissedIds],
  );

  const isDismissed = useCallback(
    (runId: string) => dismissedIds.includes(runId),
    [dismissedIds],
  );

  const dismiss = useCallback(
    (runId: string) => {
      setRawDismissedIds((current) => {
        const sanitized = sanitizeDismissedRunIds(current);
        if (sanitized.includes(runId)) return sanitized;
        const next = [...sanitized, runId];
        return next.length > MAX_TRACKED_DISMISSED_RUNS
          ? next.slice(next.length - MAX_TRACKED_DISMISSED_RUNS)
          : next;
      });
    },
    [setRawDismissedIds],
  );

  return { isDismissed, dismiss };
}
