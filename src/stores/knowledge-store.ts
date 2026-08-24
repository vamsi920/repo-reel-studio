import { create } from "zustand";
import type {
  KnowledgeRepository,
  RepositorySnapshot,
} from "#/lib/knowledge/knowledge-engine";
import type { PageQualityFlag } from "#/lib/knowledge/quality-review";
import type { DeepWikiWikiTaskStatus } from "#/api/deepwiki-service/deepwiki-service.types";

export type KnowledgeGenerationStatus =
  | "idle"
  | "generating"
  | "ready"
  | "error";

export type ProvisioningStage =
  | "creating_conversation"
  | "provisioning_workspace"
  | "resolving_commit";

export interface ProvisioningState {
  owner: string;
  repo: string;
  branch: string;
  stage: ProvisioningStage;
  error: string | null;
}

export type RefreshCadence = "manual" | "daily" | "weekly" | "monthly";

export interface KnowledgeRepositoryState {
  snapshot: RepositorySnapshot;
  /** Not part of the normalized RepositorySnapshot (which is intentionally
   * DeepWiki/video-pipeline agnostic) — kept alongside it so "Watch KT" can
   * read real file content for the exact commit via the same authenticated
   * workspace client used everywhere else in this app. */
  conversationUrl: string | null;
  sessionApiKey: string | null;
  status: KnowledgeGenerationStatus;
  progress: DeepWikiWikiTaskStatus | null;
  knowledge: KnowledgeRepository | null;
  error: string | null;
  /** Cheap post-generation grounding checks (weak/no citations, files outside
   * any detected real subsystem) — surfaced as a heads-up, never blocking. */
  qualityFlags: PageQualityFlag[];
  /** A preference, not a scheduler — this app has no background process to
   * run one against (see docs/deepwiki-video-kt-integration.md). "Due for a
   * refresh" is computed from this + `knowledge.generatedAt` whenever the
   * repository page is open, and surfaces as a one-click regenerate prompt,
   * never a silent auto-run. */
  refreshCadence: RefreshCadence;
}

interface KnowledgeStore {
  byRepositoryId: Record<string, KnowledgeRepositoryState>;
  startGenerating: (
    snapshot: RepositorySnapshot,
    conversationUrl: string | null,
    sessionApiKey: string | null,
  ) => void;
  setProgress: (repositoryId: string, progress: DeepWikiWikiTaskStatus) => void;
  setReady: (
    repositoryId: string,
    knowledge: KnowledgeRepository,
    qualityFlags?: PageQualityFlag[],
  ) => void;
  /** Seeds a full `ready` entry directly, for cold rehydration from
   * persisted (Supabase) data where no live conversation/session exists yet
   * to have called `startGenerating` first -- `setReady` alone is a no-op in
   * that case (it only ever updates an existing entry). */
  hydrate: (
    repositoryId: string,
    snapshot: RepositorySnapshot,
    knowledge: KnowledgeRepository,
    qualityFlags: PageQualityFlag[],
  ) => void;
  setError: (repositoryId: string, error: string) => void;
  setRefreshCadence: (repositoryId: string, cadence: RefreshCadence) => void;

  /** Tracks the pre-generation phase (creating a conversation, waiting for
   * its workspace, resolving a commit) for repositories added directly from
   * the "Add Repository" trigger on /kt — before a RepositorySnapshot even
   * exists to hand to startGenerating. Cleared once startGenerating takes
   * over. */
  provisioningByRepositoryId: Record<string, ProvisioningState>;
  startProvisioning: (
    repositoryId: string,
    info: { owner: string; repo: string; branch: string },
  ) => void;
  setProvisioningStage: (
    repositoryId: string,
    stage: ProvisioningStage,
  ) => void;
  setProvisioningError: (repositoryId: string, error: string) => void;
  clearProvisioning: (repositoryId: string) => void;
}

/**
 * The store itself is in-memory-only, but `hydrate` lets a cold page load
 * seed a full entry from Supabase (src/lib/data-platform/repositories/
 * knowledge-repository.ts) without needing to re-run generation first. See
 * `src/routes/kt-repository.tsx` for the rehydration call site.
 */
export const useKnowledgeStore = create<KnowledgeStore>()((set) => ({
  byRepositoryId: {},

  startGenerating: (snapshot, conversationUrl, sessionApiKey) =>
    set((state) => ({
      byRepositoryId: {
        ...state.byRepositoryId,
        [snapshot.repositoryId]: {
          snapshot,
          conversationUrl,
          sessionApiKey,
          status: "generating",
          progress: null,
          knowledge: null,
          error: null,
          refreshCadence:
            state.byRepositoryId[snapshot.repositoryId]?.refreshCadence ??
            "manual",
          qualityFlags: [],
        },
      },
    })),

  setProgress: (repositoryId, progress) =>
    set((state) => {
      const existing = state.byRepositoryId[repositoryId];
      if (!existing) return state;
      return {
        byRepositoryId: {
          ...state.byRepositoryId,
          [repositoryId]: { ...existing, progress },
        },
      };
    }),

  setReady: (repositoryId, knowledge, qualityFlags = []) =>
    set((state) => {
      const existing = state.byRepositoryId[repositoryId];
      if (!existing) return state;
      return {
        byRepositoryId: {
          ...state.byRepositoryId,
          [repositoryId]: {
            ...existing,
            status: "ready",
            knowledge,
            error: null,
            qualityFlags,
          },
        },
      };
    }),

  hydrate: (repositoryId, snapshot, knowledge, qualityFlags) =>
    set((state) => ({
      byRepositoryId: {
        ...state.byRepositoryId,
        [repositoryId]: {
          snapshot,
          conversationUrl: null,
          sessionApiKey: null,
          status: "ready",
          progress: null,
          knowledge,
          error: null,
          qualityFlags,
          refreshCadence:
            state.byRepositoryId[repositoryId]?.refreshCadence ?? "manual",
        },
      },
    })),

  setError: (repositoryId, error) =>
    set((state) => {
      const existing = state.byRepositoryId[repositoryId];
      if (!existing) return state;
      return {
        byRepositoryId: {
          ...state.byRepositoryId,
          [repositoryId]: { ...existing, status: "error", error },
        },
      };
    }),

  setRefreshCadence: (repositoryId, refreshCadence) =>
    set((state) => {
      const existing = state.byRepositoryId[repositoryId];
      if (!existing) return state;
      return {
        byRepositoryId: {
          ...state.byRepositoryId,
          [repositoryId]: { ...existing, refreshCadence },
        },
      };
    }),

  provisioningByRepositoryId: {},

  startProvisioning: (repositoryId, info) =>
    set((state) => ({
      provisioningByRepositoryId: {
        ...state.provisioningByRepositoryId,
        [repositoryId]: {
          ...info,
          stage: "creating_conversation",
          error: null,
        },
      },
    })),

  setProvisioningStage: (repositoryId, stage) =>
    set((state) => {
      const existing = state.provisioningByRepositoryId[repositoryId];
      if (!existing) return state;
      return {
        provisioningByRepositoryId: {
          ...state.provisioningByRepositoryId,
          [repositoryId]: { ...existing, stage },
        },
      };
    }),

  setProvisioningError: (repositoryId, error) =>
    set((state) => {
      const existing = state.provisioningByRepositoryId[repositoryId];
      if (!existing) return state;
      return {
        provisioningByRepositoryId: {
          ...state.provisioningByRepositoryId,
          [repositoryId]: { ...existing, error },
        },
      };
    }),

  clearProvisioning: (repositoryId) =>
    set((state) => {
      if (!(repositoryId in state.provisioningByRepositoryId)) return state;
      const rest = { ...state.provisioningByRepositoryId };
      delete rest[repositoryId];
      return { provisioningByRepositoryId: rest };
    }),
}));
