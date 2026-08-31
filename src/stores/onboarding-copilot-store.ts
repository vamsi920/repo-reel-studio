import { create } from "zustand";
import type { Capability } from "#/lib/environment/types/capability";

/**
 * UI state for the onboarding agent dock.
 *
 * Deliberately holds no credential material and no field values. The
 * credential sheet keeps what the user types in component-local state and
 * posts it straight to the Edge Function; if a secret could reach this store
 * it would be one `persist()` away from localStorage and one devtools tab
 * away from a screenshot. `__tests__/stores/onboarding-copilot-store.test.ts`
 * asserts the shape stays free of value fields.
 */
export interface PendingCredentialRequest {
  requestId: string;
  capability: Capability;
  providerId: string;
  instanceKey: string;
  /** Field NAMES only. The agent never supplies, and never receives, values. */
  fields: string[];
}

interface OnboardingCopilotState {
  open: boolean;
  /** Text to pre-fill the composer with when the dock opens. */
  seedPrompt: string | null;
  pendingCredentialRequest: PendingCredentialRequest | null;
}

interface OnboardingCopilotActions {
  open_: () => void;
  close: () => void;
  toggle: () => void;
  openWithSeed: (prompt: string) => void;
  consumeSeed: () => string | null;
  requestCredentials: (request: PendingCredentialRequest) => void;
  clearCredentialRequest: () => void;
}

export type OnboardingCopilotStore = OnboardingCopilotState &
  OnboardingCopilotActions;

export const useOnboardingCopilotStore = create<OnboardingCopilotStore>()(
  (set, get) => ({
    open: false,
    seedPrompt: null,
    pendingCredentialRequest: null,

    open_: () => set({ open: true }),
    close: () => set({ open: false }),
    toggle: () => set((state) => ({ open: !state.open })),

    openWithSeed: (prompt) => set({ open: true, seedPrompt: prompt }),
    consumeSeed: () => {
      const { seedPrompt } = get();
      if (seedPrompt !== null) set({ seedPrompt: null });
      return seedPrompt;
    },

    requestCredentials: (request) =>
      set({ open: true, pendingCredentialRequest: request }),
    clearCredentialRequest: () => set({ pendingCredentialRequest: null }),
  }),
);
