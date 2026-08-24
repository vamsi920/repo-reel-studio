import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { RealUsageEvent } from "#/lib/real-usage/types";

const STORAGE_KEY = "neo-real-usage-telemetry";

/** Bounded so a long-running tab cannot grow the persisted blob without limit. */
const MAX_EVENTS_PER_WORKSPACE = 500;

interface RealUsageState {
  eventsByWorkspace: Record<string, RealUsageEvent[]>;
}

interface RealUsageActions {
  /**
   * Upsert by id, never a blind append -- this is what makes merging in a
   * Supabase Realtime echo of this tab's own write idempotent regardless of
   * arrival order (see `patchEventId` and the Realtime subscription hook).
   */
  recordUsageEvent: (event: RealUsageEvent) => void;
  /** Swaps a client-generated id for the id Supabase assigned on insert. */
  patchEventId: (workspaceId: string, oldId: string, newId: string) => void;
  clearWorkspace: (workspaceId: string) => void;
}

type RealUsageStore = RealUsageState & RealUsageActions;

function upsertById(
  events: RealUsageEvent[],
  event: RealUsageEvent,
): RealUsageEvent[] {
  const withoutExisting = events.filter((existing) => existing.id !== event.id);
  return [...withoutExisting, event].slice(-MAX_EVENTS_PER_WORKSPACE);
}

export const useRealUsageStore = create<RealUsageStore>()(
  persist(
    (set) => ({
      eventsByWorkspace: {},

      recordUsageEvent: (event) =>
        set((state) => {
          const existing = state.eventsByWorkspace[event.workspaceId] ?? [];
          return {
            eventsByWorkspace: {
              ...state.eventsByWorkspace,
              [event.workspaceId]: upsertById(existing, event),
            },
          };
        }),

      patchEventId: (workspaceId, oldId, newId) =>
        set((state) => {
          const existing = state.eventsByWorkspace[workspaceId];
          if (!existing) return state;
          return {
            eventsByWorkspace: {
              ...state.eventsByWorkspace,
              [workspaceId]: existing.map((event) =>
                event.id === oldId ? { ...event, id: newId } : event,
              ),
            },
          };
        }),

      clearWorkspace: (workspaceId) =>
        set((state) => {
          const events = { ...state.eventsByWorkspace };
          delete events[workspaceId];
          return { eventsByWorkspace: events };
        }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): RealUsageState => ({
        eventsByWorkspace: state.eventsByWorkspace,
      }),
    },
  ),
);

export default useRealUsageStore;
