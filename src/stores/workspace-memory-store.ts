import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type {
  SavingsSample,
  WorkspaceActivityEvent,
} from "#/lib/workspace-memory";

const STORAGE_KEY = "neo-workspace-memory-telemetry";

/** Bounded so a long-running tab cannot grow the persisted blob without limit. */
const MAX_ACTIVITY = 100;
const MAX_SAMPLES_PER_WORKSPACE = 200;

interface WorkspaceMemoryState {
  activeWorkspaceId: string | null;
  /** Newest first. */
  activity: WorkspaceActivityEvent[];
  samplesByWorkspace: Record<string, SavingsSample[]>;
  /** Last mirror attempt per workspace, so Memory Health can show the truth. */
  lastMirrorByWorkspace: Record<
    string,
    { at: string; flushed: number; error?: string }
  >;
}

interface WorkspaceMemoryActions {
  setActiveWorkspace: (workspaceId: string | null) => void;
  pushActivity: (event: WorkspaceActivityEvent) => void;
  recordSavings: (sample: SavingsSample) => void;
  recordMirrorResult: (
    workspaceId: string,
    result: { flushed: number; error?: string },
  ) => void;
  clearWorkspaceTelemetry: (workspaceId: string) => void;
}

type WorkspaceMemoryStore = WorkspaceMemoryState & WorkspaceMemoryActions;

export const useWorkspaceMemoryStore = create<WorkspaceMemoryStore>()(
  persist(
    (set) => ({
      activeWorkspaceId: null,
      activity: [],
      samplesByWorkspace: {},
      lastMirrorByWorkspace: {},

      setActiveWorkspace: (workspaceId) =>
        set({ activeWorkspaceId: workspaceId }),

      pushActivity: (event) =>
        set((state) => ({
          activity: [event, ...state.activity].slice(0, MAX_ACTIVITY),
        })),

      recordSavings: (sample) =>
        set((state) => {
          const existing = state.samplesByWorkspace[sample.workspaceId] ?? [];
          return {
            samplesByWorkspace: {
              ...state.samplesByWorkspace,
              [sample.workspaceId]: [...existing, sample].slice(
                -MAX_SAMPLES_PER_WORKSPACE,
              ),
            },
          };
        }),

      recordMirrorResult: (workspaceId, result) =>
        set((state) => ({
          lastMirrorByWorkspace: {
            ...state.lastMirrorByWorkspace,
            [workspaceId]: { at: new Date().toISOString(), ...result },
          },
        })),

      clearWorkspaceTelemetry: (workspaceId) =>
        set((state) => {
          const samples = { ...state.samplesByWorkspace };
          const mirrors = { ...state.lastMirrorByWorkspace };
          delete samples[workspaceId];
          delete mirrors[workspaceId];
          return {
            samplesByWorkspace: samples,
            lastMirrorByWorkspace: mirrors,
            activity: state.activity.filter(
              (event) => event.workspaceId !== workspaceId,
            ),
          };
        }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): WorkspaceMemoryState => ({
        activeWorkspaceId: state.activeWorkspaceId,
        activity: state.activity,
        samplesByWorkspace: state.samplesByWorkspace,
        lastMirrorByWorkspace: state.lastMirrorByWorkspace,
      }),
    },
  ),
);

export default useWorkspaceMemoryStore;
