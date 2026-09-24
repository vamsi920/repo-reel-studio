import { create } from "zustand";
import type {
  KnowledgeRepository,
  RepositorySnapshot,
} from "#/lib/knowledge/knowledge-engine";
import type { PageQualityFlag } from "#/lib/knowledge/quality-review";
import type {
  DeepWikiTaskStatus,
  DeepWikiWikiTaskStatus,
} from "#/api/deepwiki-service/deepwiki-service.types";

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
  /** The most recent non-terminal DeepWiki status seen for this repository
   * (e.g. "indexing", "determining_structure") -- kept around after
   * `progress.status` flips to "failed" so the UI can still show how far
   * the task actually got before it died, instead of collapsing every
   * failure onto the last step. */
  lastNonTerminalStatus: DeepWikiTaskStatus | null;
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
  /** Returns an opaque attempt token identifying this call, for
   * `setProgress`/`setReady`/`setError` to prove they belong to the
   * generation attempt still in flight (see the module-level attempt
   * tracking below). */
  startGenerating: (
    snapshot: RepositorySnapshot,
    conversationUrl: string | null,
    sessionApiKey: string | null,
  ) => number;
  /** `attempt`, when passed, must match the token `startGenerating` returned
   * for this repositoryId's *current* attempt, or the call is dropped. Every
   * production caller goes through `generateKnowledge()`, which always
   * passes its own token; omitting it (as some tests do) always applies the
   * write, matching the old unconditional behavior. */
  setProgress: (
    repositoryId: string,
    progress: DeepWikiWikiTaskStatus,
    attempt?: number,
  ) => void;
  setReady: (
    repositoryId: string,
    knowledge: KnowledgeRepository,
    qualityFlags?: PageQualityFlag[],
    attempt?: number,
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
  setError: (repositoryId: string, error: string, attempt?: number) => void;
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

  /** Drops every in-memory entry. `repositoryId` here is a bare
   * `"owner/repo@branch"` string with no active-backend/org scoping, unlike
   * every other long-lived cache in this app (see the convention documented
   * in `active-backend-context.tsx`'s `setActive()`), so switching backends
   * without this call would let one backend's conversationUrl/sessionApiKey/
   * knowledge content leak into another backend that happens to have a
   * same-named repo/branch. Called from `setActive()` on every real
   * backend/org switch; each affected route already re-derives its entry
   * from a live conversation or Supabase via `useKnowledgeRehydration`, so
   * this is a cheap reset, not a destructive one. */
  reset: () => void;
}

// Two independent flows can target the very same repositoryId concurrently
// -- e.g. clicking "Generate" on a connected repo's RepoCard while a second
// "Add Repository" pass for the identical owner/repo/branch is still
// resolving its commit, or clicking Regenerate while an older attempt is
// still polling DeepWiki. Nothing in `byRepositoryId` distinguished an old
// attempt's writes from a newer one's, so whichever attempt's async work
// happened to settle *last* silently won, even if it was the older,
// now-irrelevant one -- overwriting a newer (possibly already-`ready`)
// result with stale progress/content. `startGenerating` mints a fresh token
// per attempt for a given repositoryId; `setProgress`/`setReady`/`setError`
// drop a write whose token no longer matches that repositoryId's current
// attempt. Kept outside the Zustand `set` state (a plain module map, not
// itself reactive state) since it's a write-ordering guard, not anything a
// component should ever read or re-render on.
let nextAttempt = 0;
const activeAttemptByRepositoryId = new Map<string, number>();

function isStaleAttempt(repositoryId: string, attempt: number | undefined) {
  if (attempt === undefined) return false;
  return activeAttemptByRepositoryId.get(repositoryId) !== attempt;
}

/**
 * The store itself is in-memory-only, but `hydrate` lets a cold page load
 * seed a full entry from Supabase (src/lib/data-platform/repositories/
 * knowledge-repository.ts) without needing to re-run generation first. See
 * `src/routes/kt-repository.tsx` for the rehydration call site.
 */
export const useKnowledgeStore = create<KnowledgeStore>()((set) => ({
  byRepositoryId: {},

  startGenerating: (snapshot, conversationUrl, sessionApiKey) => {
    nextAttempt += 1;
    const attempt = nextAttempt;
    activeAttemptByRepositoryId.set(snapshot.repositoryId, attempt);
    set((state) => {
      const existing = state.byRepositoryId[snapshot.repositoryId];
      return {
        byRepositoryId: {
          ...state.byRepositoryId,
          [snapshot.repositoryId]: {
            snapshot,
            conversationUrl,
            sessionApiKey,
            status: "generating",
            progress: null,
            lastNonTerminalStatus: null,
            // Keep any previously-generated result visible while a
            // regeneration runs instead of blanking it: every route that
            // reads this store treats `knowledge: null` as "never
            // generated", which used to flash a false "hasn't been
            // generated yet" state over a repo that already has real
            // content for the whole regeneration.
            knowledge: existing?.knowledge ?? null,
            error: null,
            refreshCadence: existing?.refreshCadence ?? "manual",
            qualityFlags: existing?.qualityFlags ?? [],
          },
        },
      };
    });
    return attempt;
  },

  setProgress: (repositoryId, progress, attempt) =>
    set((state) => {
      if (isStaleAttempt(repositoryId, attempt)) return state;
      const existing = state.byRepositoryId[repositoryId];
      if (!existing) return state;
      const isTerminal =
        progress.status === "completed" || progress.status === "failed";
      const lastNonTerminalStatus = isTerminal
        ? existing.lastNonTerminalStatus
        : progress.status;
      return {
        byRepositoryId: {
          ...state.byRepositoryId,
          [repositoryId]: { ...existing, progress, lastNonTerminalStatus },
        },
      };
    }),

  setReady: (repositoryId, knowledge, qualityFlags = [], attempt) =>
    set((state) => {
      if (isStaleAttempt(repositoryId, attempt)) return state;
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
          lastNonTerminalStatus: null,
          knowledge,
          error: null,
          qualityFlags,
          refreshCadence:
            state.byRepositoryId[repositoryId]?.refreshCadence ?? "manual",
        },
      },
    })),

  setError: (repositoryId, error, attempt) =>
    set((state) => {
      if (isStaleAttempt(repositoryId, attempt)) return state;
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

  reset: () => {
    activeAttemptByRepositoryId.clear();
    set({ byRepositoryId: {}, provisioningByRepositoryId: {} });
  },
}));
