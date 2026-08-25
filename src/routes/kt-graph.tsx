import React from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { AlertTriangle, ChevronLeft, Loader2, Network } from "lucide-react";
import Fuse from "fuse.js";

import { useKnowledgeStore } from "#/stores/knowledge-store";
import {
  selectCurrentLevel,
  selectVisibleNodes,
  useCodeGraphStore,
} from "#/stores/codegraph-store";
import { useNavigation } from "#/context/navigation-context";
import { I18nKey } from "#/i18n/declaration";
import { KnowledgeTabs } from "#/components/features/knowledge/knowledge-tabs";
import { CodeGraphCanvas } from "#/components/features/codegraph/codegraph-canvas";
import { CodeGraphToolbar } from "#/components/features/codegraph/codegraph-toolbar";
import { CodeGraphNodeDetails } from "#/components/features/codegraph/codegraph-node-details";
import {
  CodeGraphAnalyzerError,
  codegraphStoragePrefix,
  openExistingAnalysis,
  runAnalysis,
  type AnalysisHandle,
  type SearchEntry,
} from "#/lib/codegraph/analyzer-runner";
import { codeGraphKey } from "#/lib/codegraph/codegraph-types";
import {
  KnowledgeLinkIndex,
  toSubsystemHints,
} from "#/lib/codegraph/deepwiki-bridge";
import { emitCodeGraphMilestone } from "#/lib/codegraph/activity";
import { evaluateFreshness } from "#/lib/codegraph/staleness";
import {
  resolveHeadCommitSha,
  workspaceIdForSnapshot,
} from "#/lib/codegraph/workspace-identity";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { resolvePersistenceIds } from "#/lib/data-platform/repositories/repository-identity";
import { codegraphPersistenceRepository } from "#/lib/data-platform/repositories/codegraph-repository";

const MAX_SEARCH_RESULTS = 20;

function KtGraph() {
  const { t } = useTranslation("openhands");
  const { navigate } = useNavigation();
  const { backend } = useActiveBackend();
  const { repositoryId: rawRepositoryId } = useParams<{
    repositoryId: string;
  }>();
  const repositoryId = rawRepositoryId
    ? decodeURIComponent(rawRepositoryId)
    : "";

  const knowledgeState = useKnowledgeStore(
    (s) => s.byRepositoryId[repositoryId],
  );

  const snapshot = knowledgeState?.snapshot;
  const key = snapshot
    ? codeGraphKey(
        workspaceIdForSnapshot(snapshot),
        snapshot.repositoryId,
        snapshot.commitSha,
      )
    : "";
  const state = useCodeGraphStore((s) => (key ? s.byKey[key] : undefined));
  const handle = useCodeGraphStore((s) => (key ? s.handles[key] : undefined));

  const knowledgeLinks = React.useMemo(
    () =>
      new KnowledgeLinkIndex(
        repositoryId,
        knowledgeState?.knowledge ?? undefined,
      ),
    [repositoryId, knowledgeState?.knowledge],
  );

  // --- Freshness -----------------------------------------------------------
  // Checked on every open. A graph is a photograph of one commit, and showing
  // an old one as current is the worst thing this feature could do.
  React.useEffect(() => {
    if (!snapshot || !key) return;
    let cancelled = false;
    resolveHeadCommitSha(
      snapshot,
      knowledgeState?.conversationUrl ?? null,
      knowledgeState?.sessionApiKey ?? null,
    ).then((head) => {
      if (cancelled) return;
      useCodeGraphStore
        .getState()
        .setFreshness(key, evaluateFreshness(snapshot.commitSha, head));
    });
    return () => {
      cancelled = true;
    };
  }, [
    snapshot,
    key,
    knowledgeState?.conversationUrl,
    knowledgeState?.sessionApiKey,
  ]);

  const analyze = React.useCallback(
    async (force: boolean) => {
      if (!snapshot) return;
      const workspaceId = workspaceIdForSnapshot(snapshot);
      const analysisKey = useCodeGraphStore.getState().start({
        workspaceId,
        repositoryId: snapshot.repositoryId,
        commitSha: snapshot.commitSha,
      });

      // A cold-rehydrated (Supabase) Docs entry has real content but
      // `localPath: ""` and no live session -- confirmed real: without this
      // guard, `runAnalysis` (needed whenever no cached graph exists yet
      // for this commit) tried to mkdir a workspace-relative path with an
      // empty root, producing a confusing "/.neodevex: Read-only file
      // system" error instead of a clear one. Same scope boundary as Watch
      // KT: analysis needs a live sandbox to actually run in.
      if (
        !snapshot.localPath ||
        !knowledgeState?.conversationUrl ||
        !knowledgeState?.sessionApiKey
      ) {
        useCodeGraphStore
          .getState()
          .setError(
            analysisKey,
            "Open this repository's conversation to build the code graph — analysis needs a live workspace session.",
          );
        return;
      }
      const context = {
        workspaceId,
        repositoryId: snapshot.repositoryId,
        commitSha: snapshot.commitSha,
      };
      // Resolved up front (not just after a successful run) so the Storage
      // fast path in `openExistingAnalysis` works even without a live
      // sandbox -- that's the whole point of mirroring to Storage.
      const persistenceIds = await resolvePersistenceIds({
        owner: snapshot.owner,
        repo: snapshot.repo,
        branch: snapshot.branch,
        localPath: snapshot.localPath,
        backendId: backend.id,
      });
      const shared = {
        snapshot,
        conversationUrl: knowledgeState?.conversationUrl ?? null,
        sessionApiKey: knowledgeState?.sessionApiKey ?? null,
        workspaceId,
        storageIds: persistenceIds,
      };

      try {
        let result: AnalysisHandle | null = null;

        // An analysis for this exact commit is reusable; one for any other
        // commit is not, and openExistingAnalysis only ever looks at this one.
        if (!force) {
          result = await openExistingAnalysis(shared);
        }

        if (!result) {
          emitCodeGraphMilestone(context, { kind: "analysis.started" });
          result = await runAnalysis({
            ...shared,
            hints: toSubsystemHints(knowledgeState?.knowledge ?? undefined),
            onProgress: (progress) => {
              useCodeGraphStore.getState().setProgress(analysisKey, progress);
              if (progress.phase === "relationships") {
                emitCodeGraphMilestone(context, {
                  kind: "analysis.relationships",
                });
              }
              if (progress.phase === "mapped") {
                emitCodeGraphMilestone(context, {
                  kind: "analysis.mapped",
                  fileCount: progress.fileCount ?? 0,
                  symbolCount: progress.symbolCount ?? 0,
                });
              }
            },
          });
        }

        useCodeGraphStore.getState().setReady(analysisKey, result);
        emitCodeGraphMilestone(context, {
          kind: "analysis.ready",
          subsystemCount: result.root.nodes.length,
          ...(result.meta.reducedAnalysis ? { reduced: true } : {}),
        });

        // Fire-and-forget: records that a graph exists for this commit so a
        // later cold page load can auto-check instead of always showing
        // "Build code graph". `outputPath` points at the Storage mirror
        // `runAnalysis` just wrote (when `persistenceIds` resolved) -- that's
        // the payload a future visit actually reads, live sandbox or not.
        if (persistenceIds) {
          void codegraphPersistenceRepository.saveSnapshot({
            workspaceId: persistenceIds.workspaceId,
            repositoryUuid: persistenceIds.repositoryUuid,
            commitSha: snapshot.commitSha,
            nodeCount: result.root.nodes.length,
            edgeCount: result.root.edges.length,
            analyzerVersion: "understand-anything",
            outputPath: codegraphStoragePrefix(
              persistenceIds.workspaceId,
              persistenceIds.repositoryUuid,
              snapshot.commitSha,
            ),
          });
        }
      } catch (error) {
        const reason =
          error instanceof CodeGraphAnalyzerError
            ? `${error.stage}: ${error.message}`
            : error instanceof Error
              ? error.message
              : String(error);
        useCodeGraphStore.getState().setError(analysisKey, reason);
        emitCodeGraphMilestone(context, { kind: "analysis.failed", reason });
      }
    },
    [snapshot, knowledgeState],
  );

  // On a fresh page load (no in-memory graph state yet), check whether a
  // graph already exists for this commit before showing "Build code graph".
  // `openExistingAnalysis` (via `analyze(false)`) checks the Supabase Storage
  // mirror first, so this can succeed even without a live agent-server
  // session -- it only falls back to needing one if that commit was analyzed
  // before Storage mirroring existed, or the mirror upload failed.
  React.useEffect(() => {
    if (!snapshot || !key || state) return;
    let cancelled = false;
    (async () => {
      const ids = await resolvePersistenceIds({
        owner: snapshot.owner,
        repo: snapshot.repo,
        branch: snapshot.branch,
        localPath: snapshot.localPath,
        backendId: backend.id,
      });
      if (!ids || cancelled) return;
      const exists = await codegraphPersistenceRepository.hasSnapshot(
        ids.workspaceId,
        ids.repositoryUuid,
        snapshot.commitSha,
      );
      if (!exists || cancelled) return;
      analyze(false);
    })();
    return () => {
      cancelled = true;
    };

    // itself depends on `snapshot`/`knowledgeState`, already covered here.
  }, [snapshot, key, state, knowledgeState, backend.id]);

  const drillDown = React.useCallback(
    async (nodeId: string) => {
      if (!key || !handle) return;
      const current = useCodeGraphStore.getState().byKey[key];
      if (current?.levels[nodeId]) {
        useCodeGraphStore.getState().navigateTo(key, nodeId);
        return;
      }
      useCodeGraphStore.getState().beginLoadLevel(key, nodeId);
      const level = await handle.loadLevel(nodeId);
      if (!level) {
        useCodeGraphStore.getState().failLevel(key, nodeId);
        return;
      }
      useCodeGraphStore.getState().setLevel(key, nodeId, level);
      useCodeGraphStore.getState().navigateTo(key, nodeId);
    },
    [key, handle],
  );

  // --- Search --------------------------------------------------------------
  const ensureSearchIndex = React.useCallback(async () => {
    if (!key || !handle) return;
    if (useCodeGraphStore.getState().byKey[key]?.searchIndex) return;
    const entries = await handle.loadSearchIndex();
    useCodeGraphStore.getState().setSearchIndex(key, entries);
  }, [key, handle]);

  const fuse = React.useMemo(() => {
    if (!state?.searchIndex) return null;
    return new Fuse(state.searchIndex, {
      keys: ["name", "filePath"],
      threshold: 0.35,
      ignoreLocation: true,
    });
  }, [state?.searchIndex]);

  const searchResults = React.useMemo<SearchEntry[]>(() => {
    if (!fuse || !state?.searchQuery) return [];
    return fuse
      .search(state.searchQuery, { limit: MAX_SEARCH_RESULTS })
      .map((result) => result.item);
  }, [fuse, state?.searchQuery]);

  const selectSearchResult = React.useCallback(
    async (entry: SearchEntry) => {
      if (!key) return;
      // A hit usually lives on a level that isn't open. Navigate to its parent
      // first so selecting it actually reveals something.
      if (entry.parentId) await drillDown(entry.parentId);
      useCodeGraphStore.getState().selectNode(key, entry.id);
      useCodeGraphStore.getState().setSearchQuery(key, "");
    },
    [key, drillDown],
  );

  // --- Render --------------------------------------------------------------
  if (!knowledgeState?.knowledge || !snapshot) {
    return (
      <main className="min-h-full" data-testid="kt-graph">
        <div className="mx-auto max-w-4xl p-6">
          <button
            type="button"
            onClick={() => navigate?.("/kt")}
            className="mb-4 flex items-center gap-1 text-sm text-[var(--oh-muted)] hover:text-[var(--oh-foreground)]"
          >
            <ChevronLeft className="size-4" aria-hidden />
            {t(I18nKey.KT$BACK_TO_LIST)}
          </button>
          <p className="text-sm text-[var(--oh-muted)]">
            {t(I18nKey.CODEGRAPH$NO_KNOWLEDGE)}
          </p>
        </div>
      </main>
    );
  }

  const level = selectCurrentLevel(state);
  const visibleNodes = selectVisibleNodes(state);
  const selectedNode = state?.selectedNodeId
    ? level?.nodes.find((node) => node.id === state.selectedNodeId)
    : undefined;

  const availableTypes = Array.from(
    new Set((level?.nodes ?? []).map((node) => node.type)),
  ).sort();

  const highlighted = new Set(
    state?.searchQuery ? searchResults.map((entry) => entry.id) : [],
  );

  return (
    <main className="flex h-full min-h-0 flex-col" data-testid="kt-graph">
      <div className="px-6 pt-6">
        <button
          type="button"
          onClick={() => navigate?.("/kt")}
          className="mb-3 flex items-center gap-1 text-sm text-[var(--oh-muted)] hover:text-[var(--oh-foreground)]"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {t(I18nKey.KT$BACK_TO_LIST)}
        </button>
        <KnowledgeTabs repositoryId={repositoryId} active="graph" />
      </div>

      <p className="px-6 pt-3 font-mono text-xs text-[var(--oh-muted)]">
        {snapshot.owner}/{snapshot.repo}@{snapshot.commitSha.slice(0, 7)}
        {state?.meta
          ? ` · ${state.meta.fileCount.toLocaleString()} files · ${state.meta.symbolCount.toLocaleString()} symbols`
          : null}
      </p>

      {state?.freshness?.freshness === "stale" ? (
        <div
          data-testid="codegraph-stale-banner"
          className="mx-6 mt-3 flex items-center gap-2 rounded-md border border-[var(--warning-500)] bg-[var(--warning-bg-subtle)] px-3 py-2 text-xs text-[var(--oh-foreground)]"
        >
          <AlertTriangle
            className="size-4 shrink-0 text-[var(--warning-500)]"
            aria-hidden
          />
          <span className="flex-1">
            {t(I18nKey.CODEGRAPH$STALE)}{" "}
            <span className="font-mono">
              {state.freshness.graphCommitSha.slice(0, 7)} →{" "}
              {state.freshness.headCommitSha?.slice(0, 7)}
            </span>
          </span>
          <button
            type="button"
            data-testid="codegraph-reanalyze"
            onClick={() => analyze(true)}
            className="shrink-0 rounded-md border border-[var(--oh-border)] px-2 py-1 hover:bg-[var(--oh-interactive-hover)]"
          >
            {t(I18nKey.CODEGRAPH$REBUILD)}
          </button>
        </div>
      ) : null}

      {state?.meta?.reducedAnalysis ? (
        <p className="mx-6 mt-2 rounded-md border border-[var(--oh-border)] px-3 py-2 text-xs text-[var(--oh-muted)]">
          {t(I18nKey.CODEGRAPH$REDUCED)}
        </p>
      ) : null}

      {!state || state.status === "idle" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <Network className="size-8 text-[var(--oh-muted)]" aria-hidden />
          <p className="text-sm text-[var(--oh-muted)]">
            {t(I18nKey.CODEGRAPH$EMPTY)}
          </p>
          <button
            type="button"
            data-testid="codegraph-generate"
            onClick={() => analyze(false)}
            className="rounded-md border border-[var(--primary-500)] bg-[var(--primary-bg-subtle)] px-3 py-1.5 text-sm font-medium text-[var(--primary-500)]"
          >
            {t(I18nKey.CODEGRAPH$GENERATE)}
          </button>
        </div>
      ) : null}

      {state?.status === "analyzing" ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="flex items-center gap-2 text-sm text-[var(--oh-muted)]">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {state.progress?.phase === "relationships" ||
            state.progress?.phase === "mapped"
              ? t(I18nKey.CODEGRAPH$BUILDING)
              : t(I18nKey.CODEGRAPH$ANALYZING)}
          </p>
        </div>
      ) : null}

      {state?.status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
          <AlertTriangle
            className="size-7 text-[var(--danger-500)]"
            aria-hidden
          />
          <p className="text-sm font-medium text-[var(--oh-foreground)]">
            {t(I18nKey.CODEGRAPH$FAILED)}
          </p>
          <p className="max-w-xl text-center font-mono text-xs text-[var(--oh-muted)]">
            {state.error}
          </p>
          <button
            type="button"
            onClick={() => analyze(true)}
            className="rounded-md border border-[var(--oh-border)] px-3 py-1.5 text-sm text-[var(--oh-foreground)] hover:bg-[var(--oh-interactive-hover)]"
          >
            {t(I18nKey.CODEGRAPH$REBUILD)}
          </button>
        </div>
      ) : null}

      {state?.status === "ready" && level ? (
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <CodeGraphToolbar
              crumbs={level.crumbs}
              nodeCount={level.nodes.length}
              visibleCount={visibleNodes.length}
              types={availableTypes}
              hiddenTypes={state.hiddenTypes}
              onToggleType={(type) =>
                useCodeGraphStore.getState().toggleType(key, type)
              }
              onNavigate={(parentId) => {
                if (parentId === null) {
                  useCodeGraphStore.getState().navigateTo(key, null);
                } else {
                  drillDown(parentId);
                }
              }}
              searchQuery={state.searchQuery}
              onSearchChange={(query) => {
                useCodeGraphStore.getState().setSearchQuery(key, query);
                if (query) ensureSearchIndex();
              }}
              searchResults={searchResults}
              onSelectResult={selectSearchResult}
              levelNodes={level.nodes}
              onRebuild={() => analyze(true)}
            />
            <div className="min-h-0 flex-1">
              <CodeGraphCanvas
                nodes={visibleNodes}
                edges={level.edges}
                selectedNodeId={state.selectedNodeId}
                highlightedIds={highlighted}
                onSelect={(nodeId) =>
                  useCodeGraphStore
                    .getState()
                    .selectNode(key, nodeId === "" ? null : nodeId)
                }
                onDrillDown={drillDown}
              />
            </div>
          </div>

          {selectedNode ? (
            <CodeGraphNodeDetails
              node={selectedNode}
              edges={level.edges}
              siblings={level.nodes}
              knowledgeLink={knowledgeLinks.resolve(selectedNode)}
              onSelect={(nodeId) =>
                useCodeGraphStore.getState().selectNode(key, nodeId)
              }
              onDrillDown={drillDown}
              onClose={() => useCodeGraphStore.getState().selectNode(key, null)}
              readSource={handle?.readSource ?? (() => Promise.resolve(null))}
            />
          ) : null}
        </div>
      ) : null}
    </main>
  );
}

export default KtGraph;
