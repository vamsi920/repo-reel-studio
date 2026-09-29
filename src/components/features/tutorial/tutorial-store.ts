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

/**
 * localStorage key holding the step of a tour that is still open, so a reload
 * (or a page that hard-navigates) picks the tour back up where it was instead
 * of dropping it. Removed as soon as the tour closes.
 */
export const TUTORIAL_PROGRESS_STORAGE_KEY = "neo-tutorial-progress";

function writeTutorialProgress(stepIndex: number | null): void {
  try {
    if (stepIndex === null) {
      window.localStorage.removeItem(TUTORIAL_PROGRESS_STORAGE_KEY);
    } else {
      window.localStorage.setItem(
        TUTORIAL_PROGRESS_STORAGE_KEY,
        String(stepIndex),
      );
    }
  } catch {
    // best-effort
  }
}

/**
 * The step an interrupted tour was on, or `null` when no tour was in
 * progress. Out-of-range or garbled values are discarded.
 */
export function readTutorialProgress(stepCount: number): number | null {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(TUTORIAL_PROGRESS_STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const index = Number(raw);
  return index < stepCount ? index : null;
}

/**
 * Users who ask the OS for reduced motion get a tour that waits for them
 * instead of one that advances on its own.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Reading-time floor and ceiling for one auto-played caption. */
export const TUTORIAL_MIN_CAPTION_MS = 4000;
export const TUTORIAL_MAX_CAPTION_MS = 15000;
const TUTORIAL_CAPTION_BASE_MS = 1500;
const TUTORIAL_CAPTION_MS_PER_CHAR = 55;

/**
 * How long "watch" mode lingers on a caption before advancing: a fixed lead-in
 * plus time proportional to its length (~200 wpm for Latin scripts), clamped
 * so short captions stay readable and long ones don't stall the tour.
 */
export function getCaptionDurationMs(caption: string): number {
  const length = Array.from(caption.trim()).length;
  const raw = TUTORIAL_CAPTION_BASE_MS + length * TUTORIAL_CAPTION_MS_PER_CHAR;
  return Math.min(
    Math.max(raw, TUTORIAL_MIN_CAPTION_MS),
    TUTORIAL_MAX_CAPTION_MS,
  );
}

interface TutorialState {
  isOpen: boolean;
  stepIndex: number;
  /** "Watch" mode: captions advance on their own until the last step. */
  isPlaying: boolean;
  /** Opens the tour at the first step, auto-playing unless reduced motion. */
  start: () => void;
  /** Reopens an interrupted tour at `stepIndex`, paused so the user can reorient. */
  resume: (stepIndex: number) => void;
  setPlaying: (isPlaying: boolean) => void;
  goTo: (index: number, stepCount: number) => void;
  /** Closes the tour and records it as seen (skip, Escape, or finish). */
  close: () => void;
}

export const useTutorialStore = create<TutorialState>()((set) => ({
  isOpen: false,
  stepIndex: 0,
  isPlaying: false,
  start: () => {
    writeTutorialProgress(0);
    set({ isOpen: true, stepIndex: 0, isPlaying: !prefersReducedMotion() });
  },
  resume: (stepIndex) => {
    writeTutorialProgress(stepIndex);
    set({ isOpen: true, stepIndex, isPlaying: false });
  },
  setPlaying: (isPlaying) => set({ isPlaying }),
  goTo: (index, stepCount) => {
    const stepIndex = Math.min(Math.max(index, 0), Math.max(stepCount - 1, 0));
    writeTutorialProgress(stepIndex);
    set({ stepIndex });
  },
  close: () => {
    markTutorialSeen();
    writeTutorialProgress(null);
    set({ isOpen: false, stepIndex: 0, isPlaying: false });
  },
}));
