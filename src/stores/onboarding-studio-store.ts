import { create } from "zustand";
import type { Capability } from "#/lib/environment/types/capability";
import type { ProbeResult } from "#/lib/environment/types/probe";
import type { ReadinessReport } from "#/lib/environment/types/requirements";
import type {
  DiscoveryConfidence,
  DiscoverySection,
} from "#/constants/onboarding-control";

/**
 * The setup studio's right-hand workbench.
 *
 * Everything the agent produces during onboarding lands here as a card, in the
 * order it happened, and the conversation on the left never navigates away.
 * That ordering is the product: the original implementation teleported the
 * user to a form grid the moment the agent wanted to show providers, which
 * ended the conversation mid-sentence.
 *
 * Like `onboarding-copilot-store.ts`, this store is structurally incapable of
 * holding a credential: a `form` card carries field NAMES, and the values live
 * only in the form component's own state until they are posted to the Edge
 * Function. `__tests__/stores/onboarding-studio-store.test.ts` asserts it.
 */

export interface DiscoveryFact {
  /** Stable id so the agent can correct a fact instead of duplicating it. */
  key: string;
  section: DiscoverySection;
  text: string;
  confidence: DiscoveryConfidence;
  at: string;
}

export interface SetupStep {
  id: string;
  /** Free text from the agent -- this is a plan it authored, not a fixed list. */
  title: string;
  capability?: Capability;
  status: "pending" | "active" | "done" | "skipped";
  note?: string;
}

export type WorkbenchCard =
  | { id: string; kind: "discovery" }
  | { id: string; kind: "plan" }
  | {
      id: string;
      kind: "picker";
      capability: Capability;
      providerIds: string[];
    }
  | {
      id: string;
      kind: "form";
      capability: Capability;
      providerId: string;
      instanceKey: string;
      /** Field NAMES only. `"all"` means the manifest's full field set. */
      fields: string[] | "all";
      /** Set once a probe has come back for this card. */
      result?: ProbeResult;
      status: "open" | "submitting" | "ok" | "failed";
    }
  | { id: string; kind: "probe"; label: string; result: ProbeResult }
  | {
      id: string;
      kind: "proposal";
      patch: Record<string, unknown>;
      rationale: string;
      status: "pending" | "applied" | "discarded";
    }
  | { id: string; kind: "checklist"; featureIds: string[] }
  | { id: string; kind: "summary"; readiness: ReadinessReport | null }
  | { id: string; kind: "handoff"; markdown: string };

interface OnboardingStudioState {
  /** Conversation the studio is attached to; persisted on the company profile. */
  conversationId: string | null;
  cards: WorkbenchCard[];
  facts: DiscoveryFact[];
  steps: SetupStep[];
  currentStepId: string | null;
  /** Which workbench view is focused, when the agent asks for one. */
  view: string | null;
}

interface OnboardingStudioActions {
  setConversationId: (id: string | null) => void;
  pushCard: (card: WorkbenchCard) => void;
  updateCard: (id: string, patch: Partial<WorkbenchCard>) => void;
  removeCard: (id: string) => void;
  mergeFacts: (facts: DiscoveryFact[]) => void;
  setPlan: (steps: SetupStep[], currentStepId: string | null) => void;
  advancePlan: (stepId: string, status: SetupStep["status"]) => void;
  setView: (view: string | null) => void;
  reset: () => void;
}

export type OnboardingStudioStore = OnboardingStudioState &
  OnboardingStudioActions;

const EMPTY_STATE: OnboardingStudioState = {
  conversationId: null,
  cards: [],
  facts: [],
  steps: [],
  currentStepId: null,
  view: null,
};

/**
 * A form card for a provider is replaced rather than stacked.
 *
 * An agent that retries a failed connection would otherwise leave a trail of
 * dead forms for the same provider, and the user would not know which one is
 * live.
 */
function replaceOrAppend(
  cards: WorkbenchCard[],
  card: WorkbenchCard,
): WorkbenchCard[] {
  if (card.kind === "form") {
    const existing = cards.findIndex(
      (candidate) =>
        candidate.kind === "form" &&
        candidate.providerId === card.providerId &&
        candidate.instanceKey === card.instanceKey,
    );
    if (existing >= 0) {
      const next = [...cards];
      next[existing] = card;
      return next;
    }
  }
  // Discovery and plan are singletons: they represent current state, not
  // events, so a second one would just be a stale copy of the first.
  if (card.kind === "discovery" || card.kind === "plan") {
    if (cards.some((candidate) => candidate.kind === card.kind)) return cards;
  }
  return [...cards, card];
}

export const useOnboardingStudioStore = create<OnboardingStudioStore>()(
  (set) => ({
    ...EMPTY_STATE,

    setConversationId: (id) => set({ conversationId: id }),

    pushCard: (card) =>
      set((state) => ({ cards: replaceOrAppend(state.cards, card) })),

    updateCard: (id, patch) =>
      set((state) => ({
        cards: state.cards.map((card) =>
          card.id === id ? ({ ...card, ...patch } as WorkbenchCard) : card,
        ),
      })),

    removeCard: (id) =>
      set((state) => ({ cards: state.cards.filter((card) => card.id !== id) })),

    mergeFacts: (incoming) =>
      set((state) => {
        // Keyed merge, so the agent correcting itself updates the fact in
        // place instead of leaving the contradiction on screen.
        const byKey = new Map(state.facts.map((fact) => [fact.key, fact]));
        for (const fact of incoming) byKey.set(fact.key, fact);
        return { facts: [...byKey.values()] };
      }),

    setPlan: (steps, currentStepId) => set({ steps, currentStepId }),

    advancePlan: (stepId, status) =>
      set((state) => {
        const steps = state.steps.map((step) =>
          step.id === stepId ? { ...step, status } : step,
        );
        // Move the pointer to the first step that still needs doing, so the
        // plan card always shows where the user actually is.
        const next = steps.find((step) => step.status === "pending");
        return {
          steps,
          currentStepId: next?.id ?? null,
        };
      }),

    setView: (view) => set({ view }),

    reset: () => set({ ...EMPTY_STATE }),
  }),
);
