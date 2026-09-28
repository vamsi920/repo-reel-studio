import { create } from "zustand";

/**
 * localStorage key recording that the user has finished or skipped the
 * guided tutorial. Once present the tour no longer auto-starts; the left-edge
 * launcher still replays it on demand.
 */
export const TUTORIAL_SEEN_STORAGE_KEY = "neo-tutorial-seen";

export function readTutorialSeen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(TUTORIAL_SEEN_STORAGE_KEY) !== null;
  } catch {
    // Inaccessible storage: treat as seen so the tour never loops.
    return true;
  }
}

export function markTutorialSeen(): void {
  try {
    window.localStorage.setItem(TUTORIAL_SEEN_STORAGE_KEY, "1");
  } catch {
    // best-effort
  }
}

interface TutorialState {
  isOpen: boolean;
  stepIndex: number;
  start: () => void;
  goTo: (index: number, stepCount: number) => void;
  /** Closes the tour and records it as seen (skip, Escape, or finish). */
  close: () => void;
}

export const useTutorialStore = create<TutorialState>()((set) => ({
  isOpen: false,
  stepIndex: 0,
  start: () => set({ isOpen: true, stepIndex: 0 }),
  goTo: (index, stepCount) =>
    set({
      stepIndex: Math.min(Math.max(index, 0), Math.max(stepCount - 1, 0)),
    }),
  close: () => {
    markTutorialSeen();
    set({ isOpen: false, stepIndex: 0 });
  },
}));
