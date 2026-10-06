import { create } from "zustand";

/**
 * What the AI guide is showing right now:
 * - "click": spotlight `element` and wait for the user to click it.
 * - "type": spotlight a field and wait for the user to fill it in.
 * - "explain": nothing to point at; the user presses Next.
 * - "done": the closing summary; the user presses Finish.
 */
export type AiGuideStepKind = "click" | "type" | "explain" | "done";

export interface AiGuideStep {
  kind: AiGuideStepKind;
  title: string;
  tip: string;
  element: HTMLElement | null;
}

export type AiGuideErrorKind =
  | "signed_out"
  | "rate_limited"
  | "unavailable"
  | "failed";

export type AiGuideStatus = "planning" | "waiting" | "error";

interface AiGuideState {
  /** The launch menu ("What do you want to do today?") next to the launcher. */
  isMenuOpen: boolean;
  openMenu: () => void;
  closeMenu: () => void;
  isOpen: boolean;
  /** What the user asked for, shown in the bubble header. */
  query: string;
  status: AiGuideStatus;
  step: AiGuideStep | null;
  /** Steps shown so far (there is no known total: the plan is live). */
  stepCount: number;
  errorKind: AiGuideErrorKind | null;
  open: (query: string) => void;
  /** The agent is working out the next step. */
  setPlanning: () => void;
  /**
   * Shows `step` and resolves once the user completes it (clicks the target,
   * fills the field, or presses Next/Finish). Rejects if the guide closes.
   */
  presentStep: (step: AiGuideStep) => Promise<void>;
  /** The user completed the current step. */
  advance: () => void;
  fail: (kind: AiGuideErrorKind) => void;
  /** Closes the guide and stops the agent behind it. */
  close: () => void;
  /** Registered by the runner so `close()` can stop the agent. */
  setStopper: (stop: (() => void) | null) => void;
}

/** Rejection reason for a step that was pending when the guide closed. */
export class AiGuideClosedError extends Error {
  constructor() {
    super("AI guide closed");
    this.name = "AiGuideClosedError";
  }
}

// Kept outside React state: resolvers and the stop callback aren't render data.
let pending: { resolve: () => void; reject: (error: Error) => void } | null =
  null;
let stopper: (() => void) | null = null;

function rejectPending() {
  pending?.reject(new AiGuideClosedError());
  pending = null;
}

const CLOSED_STATE = {
  isOpen: false,
  query: "",
  status: "planning" as const,
  step: null,
  stepCount: 0,
  errorKind: null,
};

/**
 * State of the AI guide. Deliberately separate from `useTutorialStore`: the
 * static tour's "seen" and "resume" bookkeeping must not be touched by an
 * on-demand AI guide.
 */
export const useAiGuideStore = create<AiGuideState>()((set) => ({
  ...CLOSED_STATE,
  isMenuOpen: false,
  openMenu: () => set({ isMenuOpen: true }),
  closeMenu: () => set({ isMenuOpen: false }),
  open: (query) => {
    rejectPending();
    set({ ...CLOSED_STATE, isMenuOpen: false, isOpen: true, query });
  },
  setPlanning: () => set({ status: "planning" }),
  presentStep: (step) =>
    new Promise<void>((resolve, reject) => {
      rejectPending();
      pending = { resolve, reject };
      set((state) => ({
        status: "waiting",
        step,
        stepCount: state.stepCount + 1,
      }));
    }),
  advance: () => {
    const current = pending;
    pending = null;
    set({ status: "planning" });
    current?.resolve();
  },
  fail: (errorKind) => {
    rejectPending();
    set({ status: "error", errorKind });
  },
  close: () => {
    rejectPending();
    const stop = stopper;
    stopper = null;
    stop?.();
    set(CLOSED_STATE);
  },
  setStopper: (stop) => {
    stopper = stop;
  },
}));
