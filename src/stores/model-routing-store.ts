import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ProfileInfo } from "@openhands/typescript-client";
import {
  freshHealth,
  recordFailure,
  recordSuccess,
  type HealthMap,
  type LlmErrorKind,
} from "#/lib/model-routing/health";
import { nextStickyState, type StickyState } from "#/lib/model-routing/sticky";
import {
  DEFAULT_ROUTING_MODE,
  DEFAULT_ROUTING_POLICY,
  type RoutingDecision,
  type RoutingMode,
  type RoutingPreferences,
} from "#/lib/model-routing/types";

/**
 * Client-side memory for model routing: per-profile health, per-conversation
 * hysteresis, fallback bookkeeping and an explainable decision log. Never
 * holds prompt text or secrets — decisions carry only scores and reason codes.
 *
 * `prefs` and `profiles` are a snapshot kept fresh by `useModelRoutingSync`
 * so non-React callers (the WebSocket error handler, KT generation) can route
 * without a QueryClient.
 */
// @spec MR-011 — Routing store
export const MODEL_ROUTING_STORAGE_KEY = "neodevex-model-routing";
export const DECISION_LOG_LIMIT = 200;

interface FallbackTurnState {
  hops: number;
  tried: string[];
}

interface ModelRoutingState {
  backendId: string | null;
  prefs: RoutingPreferences;
  profiles: ProfileInfo[];
  health: HealthMap;
  sticky: Record<string, StickyState>;
  decisions: RoutingDecision[];
  lastDecisionByConversation: Record<string, RoutingDecision>;
  /** Profile each conversation is on, as last applied by routing. */
  currentProfileByConversation: Record<string, string>;
  fallbackByConversation: Record<string, FallbackTurnState>;
  /** Per-conversation override; absent = follow `prefs.mode`. */
  modeByConversation: Record<string, RoutingMode>;
}

interface ModelRoutingActions {
  syncSnapshot: (args: {
    backendId: string;
    prefs: RoutingPreferences;
    profiles: ProfileInfo[];
  }) => void;
  recordDecision: (
    decision: RoutingDecision,
    conversationId?: string | null,
  ) => void;
  advanceSticky: (
    conversationId: string,
    outcome: { switched: boolean; wantedLower: boolean },
  ) => void;
  setCurrentProfile: (conversationId: string, profileName: string) => void;
  setConversationMode: (conversationId: string, mode: RoutingMode) => void;
  markFailure: (
    profileName: string,
    kind: LlmErrorKind,
    retryAfterMs?: number | null,
  ) => void;
  markSuccess: (profileName: string, latencyMs?: number | null) => void;
  resetHealth: (profileName?: string) => void;
  startTurn: (conversationId: string) => void;
  recordFallbackHop: (conversationId: string, triedProfile: string) => void;
}

export type ModelRoutingStore = ModelRoutingState & ModelRoutingActions;

export const DEFAULT_ROUTING_PREFERENCES: RoutingPreferences = {
  mode: DEFAULT_ROUTING_MODE,
  policy: DEFAULT_ROUTING_POLICY,
  budgetUsd: null,
  excludedProfiles: [],
};

const initialState: ModelRoutingState = {
  backendId: null,
  prefs: DEFAULT_ROUTING_PREFERENCES,
  profiles: [],
  health: {},
  sticky: {},
  decisions: [],
  lastDecisionByConversation: {},
  currentProfileByConversation: {},
  fallbackByConversation: {},
  modeByConversation: {},
};

export const useModelRoutingStore = create<ModelRoutingStore>()(
  persist(
    (set) => ({
      ...initialState,
      syncSnapshot: ({ backendId, prefs, profiles }) =>
        set((s) =>
          s.backendId === backendId
            ? { prefs, profiles }
            : // Health and hysteresis are per agent-server; a backend switch
              // starts clean rather than carrying another server's circuits.
              { ...initialState, backendId, prefs, profiles },
        ),
      recordDecision: (decision, conversationId) =>
        set((s) => ({
          decisions: [decision, ...s.decisions].slice(0, DECISION_LOG_LIMIT),
          lastDecisionByConversation: conversationId
            ? { ...s.lastDecisionByConversation, [conversationId]: decision }
            : s.lastDecisionByConversation,
        })),
      advanceSticky: (conversationId, outcome) =>
        set((s) => ({
          sticky: {
            ...s.sticky,
            [conversationId]: nextStickyState(
              s.sticky[conversationId],
              outcome,
              Date.now(),
            ),
          },
        })),
      setCurrentProfile: (conversationId, profileName) =>
        set((s) => ({
          currentProfileByConversation: {
            ...s.currentProfileByConversation,
            [conversationId]: profileName,
          },
        })),
      setConversationMode: (conversationId, mode) =>
        set((s) => ({
          modeByConversation: {
            ...s.modeByConversation,
            [conversationId]: mode,
          },
        })),
      markFailure: (profileName, kind, retryAfterMs) =>
        set((s) => ({
          health: {
            ...s.health,
            [profileName]: recordFailure(
              s.health[profileName],
              kind,
              Date.now(),
              retryAfterMs,
            ),
          },
        })),
      markSuccess: (profileName, latencyMs) =>
        set((s) => ({
          health: {
            ...s.health,
            [profileName]: recordSuccess(
              s.health[profileName],
              Date.now(),
              latencyMs,
            ),
          },
        })),
      resetHealth: (profileName) =>
        set((s) => {
          if (!profileName) return { health: {} };
          return {
            health: { ...s.health, [profileName]: freshHealth(Date.now()) },
          };
        }),
      startTurn: (conversationId) =>
        set((s) => {
          if (!(conversationId in s.fallbackByConversation)) return s;
          const fallbackByConversation = { ...s.fallbackByConversation };
          delete fallbackByConversation[conversationId];
          return { fallbackByConversation };
        }),
      recordFallbackHop: (conversationId, triedProfile) =>
        set((s) => {
          const prev = s.fallbackByConversation[conversationId] ?? {
            hops: 0,
            tried: [],
          };
          return {
            fallbackByConversation: {
              ...s.fallbackByConversation,
              [conversationId]: {
                hops: prev.hops + 1,
                tried: [...prev.tried, triedProfile],
              },
            },
          };
        }),
    }),
    {
      name: MODEL_ROUTING_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        backendId: s.backendId,
        health: s.health,
        sticky: s.sticky,
        decisions: s.decisions,
        lastDecisionByConversation: s.lastDecisionByConversation,
        currentProfileByConversation: s.currentProfileByConversation,
        modeByConversation: s.modeByConversation,
      }),
    },
  ),
);
