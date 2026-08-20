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

  meta: CodeGraphMeta | null;
  freshness: FreshnessResult | null;

  /** The node whose children are on screen; `null` is the system view. */
  currentParentId: string | null;
  /** Levels already fetched, keyed by parent id (`""` for the root). */
  levels: Record<string, CodeGraphLevelPayload>;
  /** Parents currently being fetched, so a double click doesn't double fetch. */
  loadingParents: string[];

  selectedNodeId: string | null;
  searchIndex: SearchEntry[] | null;
  searchQuery: string;
  /** Node types hidden by the filter panel. */
  hiddenTypes: string[];
}

const LEVEL_ROOT = "";

interface CodeGraphStore {
  byKey: Record<string, CodeGraphState>;
  /** Handles hold a live workspace client, so they stay out of rendered state. */
  handles: Record<string, AnalysisHandle>;

  start: (params: {
    workspaceId: string;
    repositoryId: string;
    commitSha: string;
  }) => string;
  setProgress: (key: string, progress: AnalyzerProgress) => void;
  setReady: (key: string, handle: AnalysisHandle) => void;
  setError: (key: string, error: string) => void;
  setFreshness: (key: string, freshness: FreshnessResult) => void;

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
    meta: null,
    freshness: null,
    currentParentId: null,
    levels: {},
    loadingParents: [],
    selectedNodeId: null,
    searchIndex: null,
    searchQuery: "",
    hiddenTypes: [],
  };
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
        meta: handle.meta,
        // The system view is always what loads first — never a deep level the
        // user did not ask for.
        currentParentId: null,
        levels: { [LEVEL_ROOT]: handle.root },
      }));
    },

    setError: (key, error) =>
      update(key, (state) => ({ ...state, status: "error", error })),

    setFreshness: (key, freshness) =>
      update(key, (state) => ({ ...state, freshness })),

    beginLoadLevel: (key, parentId) =>
      update(key, (state) =>
        state.loadingParents.includes(parentId)
          ? state
          : { ...state, loadingParents: [...state.loadingParents, parentId] },
      ),

    setLevel: (key, parentId, level) =>
      update(key, (state) => ({
        ...state,
        levels: { ...state.levels, [parentId]: level },
        loadingParents: state.loadingParents.filter((id) => id !== parentId),
      })),

    failLevel: (key, parentId) =>
      update(key, (state) => ({
        ...state,
        loadingParents: state.loadingParents.filter((id) => id !== parentId),
      })),

    navigateTo: (key, parentId) =>
      update(key, (state) => ({
        ...state,
        currentParentId: parentId,
        selectedNodeId: null,
      })),

    selectNode: (key, nodeId) =>
      update(key, (state) => ({ ...state, selectedNodeId: nodeId })),

    setSearchIndex: (key, searchIndex) =>
      update(key, (state) => ({ ...state, searchIndex })),

    setSearchQuery: (key, searchQuery) =>
      update(key, (state) => ({ ...state, searchQuery })),

    toggleType: (key, type) =>
      update(key, (state) => ({
        ...state,
        hiddenTypes: state.hiddenTypes.includes(type)
          ? state.hiddenTypes.filter((entry) => entry !== type)
          : [...state.hiddenTypes, type],
      })),

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

/** Key used for the root level inside `levels`. */
export const CODEGRAPH_ROOT_LEVEL = LEVEL_ROOT;

/** The level currently on screen, or `undefined` while it is still loading. */
export function selectCurrentLevel(
  state: CodeGraphState | undefined,
): CodeGraphLevelPayload | undefined {
  if (!state) return undefined;
  return state.levels[state.currentParentId ?? LEVEL_ROOT];
}

/** Applies the type filter without mutating the cached level. */
export function selectVisibleNodes(
  state: CodeGraphState | undefined,
): CodeGraphNode[] {
  const level = selectCurrentLevel(state);
  if (!level) return [];
  if (!state?.hiddenTypes.length) return level.nodes;
  return level.nodes.filter((node) => !state.hiddenTypes.includes(node.type));
}
