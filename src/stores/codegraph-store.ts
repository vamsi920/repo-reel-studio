import { create } from "zustand";
import type {
  AnalysisHandle,
  AnalyzerProgress,
  CodeGraphLevelPayload,
  SearchEntry,
} from "#/lib/codegraph/analyzer-runner";
import type {
  CodeGraphMeta,
  CodeGraphNode,
} from "#/lib/codegraph/codegraph-types";
import { codeGraphKey } from "#/lib/codegraph/codegraph-types";
import type { FreshnessResult } from "#/lib/codegraph/staleness";

export type CodeGraphStatus = "idle" | "analyzing" | "ready" | "error";

export interface CodeGraphState {
  key: string;
  workspaceId: string;
  repositoryId: string;
  commitSha: string;

  status: CodeGraphStatus;
  progress: AnalyzerProgress | null;
  error: string | null;
  /** A forced re-analysis in progress behind an already-rendered graph — the
   * graph stays on screen (status stays "ready") while this is true, rather
   * than being torn down for a blank "analyzing" spinner. */
  rebuilding: boolean;

  meta: CodeGraphMeta | null;
  freshness: FreshnessResult | null;

  /** The node whose children are on screen; `null` is the system view. */
  currentParentId: string | null;
  /** Levels already fetched, keyed by parent id (`""` for the root). */
  levels: Record<string, CodeGraphLevelPayload>;
  /** Parents currently being fetched, so a double click doesn't double fetch. */
  loadingParents: string[];
  /** The parent whose level shard could not be read on the last attempt, so
   * the UI can say so and offer a retry instead of a dead click. Cleared by
   * the next attempt or by navigating anywhere. */
  levelError: string | null;

  selectedNodeId: string | null;
  searchIndex: SearchEntry[] | null;
  searchQuery: string;
  /** Node types hidden by the filter panel, keyed by level like `levels`
   * (`""` for the root). Each level has its own set: hiding "file" inside one
   * folder must not silently thin out every other folder, and the Filters
   * badge only ever counts types that exist on the level on screen. */
  hiddenTypes: Record<string, string[]>;
}

const LEVEL_ROOT = "";

/** A graph the stale banner rebuilt under the repository's current HEAD
 * instead of the commit the Docs snapshot was generated at. */
export interface PinnedGraphCommit {
  /** The Docs snapshot commit the pin was made from — the pin only applies
   * while the snapshot still carries this commit. */
  from: string;
  /** The HEAD commit the graph was rebuilt under. */
  to: string;
}

interface CodeGraphStore {
  byKey: Record<string, CodeGraphState>;
  /** Handles hold a live workspace client, so they stay out of rendered state. */
  handles: Record<string, AnalysisHandle>;
  /** Per workspace+repository: the HEAD commit a stale-banner rebuild moved
   * the graph to. The Docs snapshot keeps its own commit (docs really were
   * generated there); only the graph route re-keys itself through this.
   * Keyed by `pinKey(workspaceId, repositoryId)`, not `repositoryId` alone --
   * the same repository can be checked out in more than one workspace (e.g.
   * two conversations against the same repo), and a rebuild in one must
   * never redirect another workspace's still-untouched view of that repo. */
  pinnedCommitByWorkspaceRepo: Record<string, PinnedGraphCommit>;

  start: (params: {
    workspaceId: string;
    repositoryId: string;
    commitSha: string;
  }) => string;
  setProgress: (key: string, progress: AnalyzerProgress) => void;
  setReady: (key: string, handle: AnalysisHandle) => void;
  setError: (key: string, error: string) => void;
  setFreshness: (key: string, freshness: FreshnessResult) => void;
  beginRebuild: (key: string) => void;
  endRebuild: (key: string) => void;
  pinCommit: (
    workspaceId: string,
    repositoryId: string,
    pin: PinnedGraphCommit,
  ) => void;

  beginLoadLevel: (key: string, parentId: string) => void;
  setLevel: (
    key: string,
    parentId: string,
    level: CodeGraphLevelPayload,
  ) => void;
  failLevel: (key: string, parentId: string) => void;

  navigateTo: (key: string, parentId: string | null) => void;
  selectNode: (key: string, nodeId: string | null) => void;
  setSearchIndex: (key: string, entries: SearchEntry[]) => void;
  setSearchQuery: (key: string, query: string) => void;
  toggleType: (key: string, type: string) => void;
  reset: (key: string) => void;
}

function emptyState(
  key: string,
  workspaceId: string,
  repositoryId: string,
  commitSha: string,
): CodeGraphState {
  return {
    key,
    workspaceId,
    repositoryId,
    commitSha,
    status: "analyzing",
    progress: null,
    error: null,
    rebuilding: false,
    meta: null,
    freshness: null,
    currentParentId: null,
    levels: {},
    loadingParents: [],
    levelError: null,
    selectedNodeId: null,
    searchIndex: null,
    searchQuery: "",
    hiddenTypes: {},
  };
}

/** The `levels` / `hiddenTypes` key for a parent id. */
function levelKey(parentId: string | null): string {
  return parentId ?? LEVEL_ROOT;
}

/**
 * In-memory, matching `knowledge-store.ts`. The graph itself is persisted the
 * sanctioned way — as files in the analyzed workspace, keyed by commit — so a
 * reload re-opens the existing analysis rather than re-running it.
 */
export const useCodeGraphStore = create<CodeGraphStore>()((set) => {
  const update = (
    key: string,
    mutate: (state: CodeGraphState) => CodeGraphState,
  ) =>
    set((store) => {
      const existing = store.byKey[key];
      if (!existing) return store;
      return { byKey: { ...store.byKey, [key]: mutate(existing) } };
    });

  return {
    byKey: {},
    handles: {},
    pinnedCommitByWorkspaceRepo: {},

    start: ({ workspaceId, repositoryId, commitSha }) => {
      const key = codeGraphKey(workspaceId, repositoryId, commitSha);
      set((store) => ({
        byKey: {
          ...store.byKey,
          [key]: emptyState(key, workspaceId, repositoryId, commitSha),
        },
      }));
      return key;
    },

    setProgress: (key, progress) =>
      update(key, (state) => ({ ...state, progress })),

    setReady: (key, handle) => {
      set((store) => ({ handles: { ...store.handles, [key]: handle } }));
      update(key, (state) => ({
        ...state,
        status: "ready",
        error: null,
        rebuilding: false,
        meta: handle.meta,
        // The system view is always what loads first — never a deep level the
        // user did not ask for.
        currentParentId: null,
        levels: { [LEVEL_ROOT]: handle.root },
        // A rebuilt graph can have different types on every level; a filter
        // kept from the old one would hide nodes the user never chose to.
        hiddenTypes: {},
      }));
    },

    setError: (key, error) =>
      update(key, (state) => ({
        ...state,
        status: "error",
        error,
        rebuilding: false,
      })),

    setFreshness: (key, freshness) =>
      update(key, (state) => ({ ...state, freshness })),

    beginRebuild: (key) =>
      update(key, (state) => ({ ...state, rebuilding: true })),

    // A rebuild that fails must not blank out a graph that was already valid
    // and on screen -- the whole point of `beginRebuild` keeping `status:
    // "ready"` is that the user keeps looking at real data while the rebuild
    // runs. This only clears the in-progress flag; `meta`/`levels`/`status`
    // are left exactly as they were.
    endRebuild: (key) =>
      update(key, (state) => ({ ...state, rebuilding: false })),

    pinCommit: (workspaceId, repositoryId, pin) =>
      set((store) => ({
        pinnedCommitByWorkspaceRepo: {
          ...store.pinnedCommitByWorkspaceRepo,
          [pinKey(workspaceId, repositoryId)]: pin,
        },
      })),

    beginLoadLevel: (key, parentId) =>
      update(key, (state) => ({
        ...state,
        loadingParents: state.loadingParents.includes(parentId)
          ? state.loadingParents
          : [...state.loadingParents, parentId],
        // Per the field's own contract, any new attempt clears a stale error
        // -- not just a retry of the exact parent that failed. Otherwise
        // navigating to an unrelated node while a previous one is still
        // showing "failed to load" leaves that stale banner on screen next
        // to the new load spinner, pointing its retry button at the wrong id.
        levelError: null,
      })),

    setLevel: (key, parentId, level) =>
      update(key, (state) => ({
        ...state,
        levels: { ...state.levels, [parentId]: level },
        loadingParents: state.loadingParents.filter((id) => id !== parentId),
        levelError: state.levelError === parentId ? null : state.levelError,
      })),

    failLevel: (key, parentId) =>
      update(key, (state) => {
        // Two drill-downs can be in flight at once (the canvas fires on both
        // single and double click, and a user can click a second node before
        // the first's shard resolves). If the other one already succeeded
        // and navigated away, this failure is for a node that isn't part of
        // the level now on screen -- surfacing it anyway would paint a
        // "failed to load" banner (and a retry button) for the wrong node.
        // When we don't even know the current level's contents yet (no
        // `setReady` completed), there's nothing to compare against, so the
        // failure is reported as usual.
        const currentLevel = state.levels[levelKey(state.currentParentId)];
        const stillReachable =
          !currentLevel || currentLevel.nodes.some((n) => n.id === parentId);
        return {
          ...state,
          loadingParents: state.loadingParents.filter((id) => id !== parentId),
          levelError: stillReachable ? parentId : state.levelError,
        };
      }),

    navigateTo: (key, parentId) =>
      update(key, (state) => ({
        ...state,
        currentParentId: parentId,
        selectedNodeId: null,
        levelError: null,
      })),

    selectNode: (key, nodeId) =>
      update(key, (state) => ({ ...state, selectedNodeId: nodeId })),

    setSearchIndex: (key, searchIndex) =>
      update(key, (state) => ({ ...state, searchIndex })),

    setSearchQuery: (key, searchQuery) =>
      update(key, (state) => ({ ...state, searchQuery })),

    toggleType: (key, type) =>
      update(key, (state) => {
        const current = levelKey(state.currentParentId);
        const hidden = state.hiddenTypes[current] ?? [];
        return {
          ...state,
          hiddenTypes: {
            ...state.hiddenTypes,
            [current]: hidden.includes(type)
              ? hidden.filter((entry) => entry !== type)
              : [...hidden, type],
          },
        };
      }),

    reset: (key) =>
      set((store) => {
        const byKey = { ...store.byKey };
        const handles = { ...store.handles };
        delete byKey[key];
        delete handles[key];
        return { byKey, handles };
      }),
  };
});

/** Key for `pinnedCommitByWorkspaceRepo` -- a workspace's view of one
 * repository, deliberately excluding `commitSha` (a pin is what decides
 * which commit that view resolves to, so it can't be part of its own key). */
export function pinKey(workspaceId: string, repositoryId: string): string {
  return `${workspaceId}::${repositoryId}`;
}

/** Key used for the root level inside `levels`. */
export const CODEGRAPH_ROOT_LEVEL = LEVEL_ROOT;

/** The level currently on screen, or `undefined` while it is still loading. */
export function selectCurrentLevel(
  state: CodeGraphState | undefined,
): CodeGraphLevelPayload | undefined {
  if (!state) return undefined;
  return state.levels[levelKey(state.currentParentId)];
}

/** The types hidden on the level currently on screen — never a type from
 * another level, so the badge, the chips and the node count always agree. */
export function selectHiddenTypes(state: CodeGraphState | undefined): string[] {
  if (!state) return [];
  return state.hiddenTypes[levelKey(state.currentParentId)] ?? [];
}

/** Applies the type filter without mutating the cached level. */
export function selectVisibleNodes(
  state: CodeGraphState | undefined,
): CodeGraphNode[] {
  const level = selectCurrentLevel(state);
  if (!level) return [];
  const hidden = selectHiddenTypes(state);
  if (!hidden.length) return level.nodes;
  return level.nodes.filter((node) => !hidden.includes(node.type));
}
