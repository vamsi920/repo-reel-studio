import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { BrainLearning, BrainSighting } from "#/lib/neo-brain/types";

const STORAGE_KEY = "neodevex-neo-brain";
const MAX_PENDING_PER_WORKSPACE = 50;
const MAX_SIGHTINGS_PER_WORKSPACE = 400;
const MAX_DISMISSED_PER_WORKSPACE = 200;
const MAX_TRACKED_CONVERSATIONS = 200;

/**
 * Brain bookkeeping that is not itself knowledge: what is waiting for review,
 * what the user turned down (so it is never proposed again), how often each
 * claim was heard, and when the background passes last ran. The knowledge
 * lives in workspace memory; every field here is keyed by workspace id.
 */
interface NeoBrainState {
  pending: Record<string, BrainLearning[]>;
  dismissed: Record<string, string[]>;
  sightings: Record<string, Record<string, BrainSighting>>;
  lastConsolidatedAt: Record<string, string>;
  /** Fingerprint of the map last written into each workspace folder. */
  lastMapFingerprint: Record<string, string>;
  /** Newest event timestamp already learned from, per conversation. */
  learnedThrough: Record<string, string>;
}

interface NeoBrainActions {
  addPending: (workspaceId: string, learning: BrainLearning) => boolean;
  removePending: (workspaceId: string, id: string) => BrainLearning | null;
  dismiss: (workspaceId: string, key: string) => void;
  recordSighting: (
    workspaceId: string,
    key: string,
    conversationId: string | null,
    at: string,
  ) => BrainSighting;
  markConsolidated: (workspaceId: string, at: string) => void;
  markMapWritten: (workspaceId: string, fingerprint: string) => void;
  markLearnedThrough: (conversationId: string, at: string) => void;
  reset: () => void;
}

export type NeoBrainStore = NeoBrainState & NeoBrainActions;

const initialState: NeoBrainState = {
  pending: {},
  dismissed: {},
  sightings: {},
  lastConsolidatedAt: {},
  lastMapFingerprint: {},
  learnedThrough: {},
};

function trimRecord<T>(
  record: Record<string, T>,
  max: number,
  lastSeen: (value: T) => string,
): Record<string, T> {
  const entries = Object.entries(record);
  if (entries.length <= max) return record;
  return Object.fromEntries(
    entries
      .sort((a, b) => Date.parse(lastSeen(b[1])) - Date.parse(lastSeen(a[1])))
      .slice(0, max),
  );
}

export const useNeoBrainStore = create<NeoBrainStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      addPending: (workspaceId, learning) => {
        const existing = get().pending[workspaceId] ?? [];
        if (existing.some((item) => item.key === learning.key)) return false;
        if ((get().dismissed[workspaceId] ?? []).includes(learning.key)) {
          return false;
        }
        set((state) => ({
          pending: {
            ...state.pending,
            [workspaceId]: [learning, ...existing].slice(
              0,
              MAX_PENDING_PER_WORKSPACE,
            ),
          },
        }));
        return true;
      },

      removePending: (workspaceId, id) => {
        const existing = get().pending[workspaceId] ?? [];
        const found = existing.find((item) => item.id === id) ?? null;
        if (!found) return null;
        set((state) => ({
          pending: {
            ...state.pending,
            [workspaceId]: existing.filter((item) => item.id !== id),
          },
        }));
        return found;
      },

      dismiss: (workspaceId, key) =>
        set((state) => {
          const existing = state.dismissed[workspaceId] ?? [];
          if (existing.includes(key)) return state;
          return {
            dismissed: {
              ...state.dismissed,
              [workspaceId]: [key, ...existing].slice(
                0,
                MAX_DISMISSED_PER_WORKSPACE,
              ),
            },
          };
        }),

      recordSighting: (workspaceId, key, conversationId, at) => {
        const forWorkspace = get().sightings[workspaceId] ?? {};
        const previous = forWorkspace[key];
        const conversation = conversationId ?? "no-conversation";
        const conversations = previous?.conversations.includes(conversation)
          ? previous.conversations
          : [...(previous?.conversations ?? []), conversation].slice(-20);
        const sighting: BrainSighting = {
          conversations,
          firstSeen: previous?.firstSeen ?? at,
          lastSeen: previous && previous.lastSeen > at ? previous.lastSeen : at,
        };
        set((state) => ({
          sightings: {
            ...state.sightings,
            [workspaceId]: trimRecord(
              { ...forWorkspace, [key]: sighting },
              MAX_SIGHTINGS_PER_WORKSPACE,
              (value) => value.lastSeen,
            ),
          },
        }));
        return sighting;
      },

      markConsolidated: (workspaceId, at) =>
        set((state) => ({
          lastConsolidatedAt: {
            ...state.lastConsolidatedAt,
            [workspaceId]: at,
          },
        })),

      markMapWritten: (workspaceId, fingerprint) =>
        set((state) => ({
          lastMapFingerprint: {
            ...state.lastMapFingerprint,
            [workspaceId]: fingerprint,
          },
        })),

      markLearnedThrough: (conversationId, at) =>
        set((state) => {
          if ((state.learnedThrough[conversationId] ?? "") >= at) return state;
          return {
            learnedThrough: trimRecord(
              { ...state.learnedThrough, [conversationId]: at },
              MAX_TRACKED_CONVERSATIONS,
              (value) => value,
            ),
          };
        }),

      reset: () => set(initialState),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);
