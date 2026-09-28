import React from "react";

/**
 * localStorage key persisting whether the welcome onboarding flow has
 * been completed (or skipped). Once present, the modal won't auto-show
 * again on subsequent visits.
 */
export const ONBOARDING_COMPLETED_STORAGE_KEY = "openhands-onboarded";

/**
 * Same-tab window event fired by `markCompleted()`, so every mounted instance
 * of the hook (e.g. the tutorial host) sees completion without a reload —
 * the `storage` event only reaches other tabs.
 */
export const ONBOARDING_COMPLETED_EVENT = "neo:onboarding-completed";

function readCompletedFromStorage(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return (
      window.localStorage.getItem(ONBOARDING_COMPLETED_STORAGE_KEY) !== null
    );
  } catch {
    // Inaccessible localStorage (private mode, SSR, …) — assume the
    // user has already onboarded so we don't loop on every render.
    return true;
  }
}

/**
 * Tracks whether the welcome onboarding modal has been completed.
 * The hook returns the current `isCompleted` flag plus an imperative
 * `markCompleted()` callback. State is mirrored to localStorage and
 * synced across tabs via the `storage` event.
 */
export function useOnboardingCompletion() {
  const [isCompleted, setIsCompleted] = React.useState<boolean>(() =>
    readCompletedFromStorage(),
  );

  React.useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== ONBOARDING_COMPLETED_STORAGE_KEY) return;
      setIsCompleted(readCompletedFromStorage());
    };
    const handleCompleted = () => setIsCompleted(true);
    window.addEventListener("storage", handleStorage);
    window.addEventListener(ONBOARDING_COMPLETED_EVENT, handleCompleted);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(ONBOARDING_COMPLETED_EVENT, handleCompleted);
    };
  }, []);

  const markCompleted = React.useCallback(() => {
    try {
      window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
    } catch {
      // best-effort; we still flip the in-memory flag below.
    }
    setIsCompleted(true);
    window.dispatchEvent(new Event(ONBOARDING_COMPLETED_EVENT));
  }, []);

  return { isCompleted, markCompleted } as const;
}
