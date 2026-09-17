import React from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { AlertTriangle, ChevronLeft, Loader2, Network } from "lucide-react";
import Fuse from "fuse.js";

import { useKnowledgeStore } from "#/stores/knowledge-store";
import {
  selectCurrentLevel,
  selectHiddenTypes,
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
  type SearchEntry,
} from "#/lib/codegraph/analyzer-runner";
import { codeGraphKey } from "#/lib/codegraph/codegraph-types";
import {
  KnowledgeLinkIndex,
  toSubsystemHints,
} from "#/lib/codegraph/deepwiki-bridge";
import { emitCodeGraphMilestone } from "#/lib/codegraph/activity";
import { evaluateFreshness, sameCommit } from "#/lib/codegraph/staleness";
import {
  resolveHeadCommitSha,
  workspaceIdForSnapshot,
} from "#/lib/codegraph/workspace-identity";
import { useActiveBackend } from "#/contexts/active-backend-context";
import {
  resolvePersistenceIds,
  resolveOrgId,
  findRepositoryUuid,
  type PersistenceIds,
} from "#/lib/data-platform/repositories/repository-identity";
import { codegraphPersistenceRepository } from "#/lib/data-platform/repositories/codegraph-repository";
import { useKnowledgeRehydration } from "#/lib/knowledge/use-knowledge-rehydration";

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
  // A deep link / reload lands here with an empty store even for a repo that
  // was generated earlier; this loads it the same way the Docs tab does.
  const rehydrationChecked = useKnowledgeRehydration(repositoryId || undefined);

  // The Docs snapshot is pinned to the commit the docs were generated at and
  // must stay that way. The graph, though, can be rebuilt under HEAD from the
  // stale banner — when it has been, the route re-keys itself to that commit
  // so the key, the header, the analyzer output dir, the Storage mirror and
  // the freshness check all describe the graph actually on screen.
  const docsSnapshot = knowledgeState?.snapshot;
  const pinnedCommit = useCodeGraphStore(
    (s) => s.pinnedCommitByRepositoryId[repositoryId],
  );
  const snapshot = React.useMemo(() => {
    if (!docsSnapshot) return undefined;
    if (pinnedCommit?.from !== docsSnapshot.commitSha) return docsSnapshot;
    return { ...docsSnapshot, commitSha: pinnedCommit.to };
  }, [docsSnapshot, pinnedCommit]);
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
    async (force: boolean, coldStorageIds?: PersistenceIds) => {
      if (!snapshot || !docsSnapshot || !key) return;
      const workspaceId = workspaceIdForSnapshot(snapshot);
      const conversationUrl = knowledgeState?.conversationUrl ?? null;
      const sessionApiKey = knowledgeState?.sessionApiKey ?? null;

      // A rebuild exists to describe the code as it is now. The sandbox
      // checkout the analyzer scans is at HEAD (that is exactly what made the
      // graph stale), so the rebuilt graph must be keyed, labelled, written
      // to `out/<sha>`, mirrored and recorded under HEAD too — never under the
      // commit the Docs snapshot happens to carry. Otherwise the old commit's
      // genuine graph gets overwritten with HEAD's code and the stale banner
      // never clears. When HEAD cannot be resolved the rebuild stays on the
      // current commit, as before.
      let target = snapshot;
      let targetKey = key;
      if (force) {
        const head = await resolveHeadCommitSha(
          snapshot,
          conversationUrl,
          sessionApiKey,
        );
        if (head && !sameCommit(head, snapshot.commitSha)) {
          target = { ...snapshot, commitSha: head };
          targetKey = codeGraphKey(workspaceId, target.repositoryId, head);
        }
      }
      const retargeted = targetKey !== key;

      // A forced rebuild of a graph that is already on screen keeps it there
      // — the toolbar's rebuild button shows progress instead of the whole
      // view being torn down for a blank "analyzing" spinner. Anything else
      // (first build, or rebuilding from the full error screen, which has no
      // graph worth preserving) resets to that spinner as before.
      const existing = useCodeGraphStore.getState().byKey[key];
      const keepOnScreen = force && existing?.status === "ready";
      if (keepOnScreen) {
        useCodeGraphStore.getState().beginRebuild(key);
      }
      if (!keepOnScreen || retargeted) {
        useCodeGraphStore.getState().start({
          workspaceId,
          repositoryId: target.repositoryId,
          commitSha: target.commitSha,
        });
      }
      // The pin is always relative to the Docs snapshot's own commit, so a
      // second rebuild (HEAD moved again) replaces the first pin instead of
      // chaining off it.
      const pin = () => {
        if (!retargeted) return;
        useCodeGraphStore.getState().pinCommit(snapshot.repositoryId, {
          from: docsSnapshot.commitSha,
          to: target.commitSha,
        });
      };
      if (!keepOnScreen) pin();
      // Progress goes to whichever key is on screen while the run lasts: the
      // old graph when it is being kept, else the target.
      const displayKey = keepOnScreen ? key : targetKey;
      // Once the run has settled, the route follows the target key; the old
      // commit's in-memory graph is dropped (its files and mirror are left
      // exactly as they were).
      const settle = () => {
        if (!retargeted || !keepOnScreen) return;
        pin();
        useCodeGraphStore.getState().reset(key);
      };

      const context = {
        workspaceId,
        repositoryId: target.repositoryId,
        commitSha: target.commitSha,
      };
      // Resolved up front (not just after a successful run) so the Storage
      // fast path in `openExistingAnalysis` works even without a live
      // sandbox -- that's the whole point of mirroring to Storage.
      // `resolvePersistenceIds` needs a real `localPath`, which a
      // cold-rehydrated entry never has -- `coldStorageIds`, when the caller
      // already resolved the snapshot's real stored ids (see the cold-load
      // effect below), is used instead so this never calls it with an empty
      // path and writes a bogus workspace row.
      const persistenceIds =
        coldStorageIds ??
        (snapshot.localPath
          ? await resolvePersistenceIds({
              owner: snapshot.owner,
              repo: snapshot.repo,
              branch: snapshot.branch,
              localPath: snapshot.localPath,
              backendId: backend.id,
            })
          : null);
      const shared = {
        snapshot: target,
        conversationUrl,
        sessionApiKey,
        workspaceId,
        storageIds: persistenceIds,
      };

      // The Storage-mirror fast path needs no live sandbox at all, so it must
      // run before the live-session guard below -- this is what lets a
      // cold-rehydrated entry (no `localPath`, no conversation) skip straight
      // to a graph that was already generated and mirrored elsewhere instead
      // of always landing on "open a live session".
      if (!force) {
        // `openExistingAnalysis` can throw synchronously (e.g. no live
        // backend/session available yet) when its Storage fast path misses
        // and it falls back to a sandbox lookup -- treated the same as "no
        // existing analysis found" so the live-session guard right below
        // gets a chance to show its clear message instead of an unhandled
        // rejection leaving the store stuck on "analyzing" forever.
        const existingResult = await openExistingAnalysis(shared).catch(
          () => null,
        );
        if (existingResult) {
          useCodeGraphStore.getState().setReady(key, existingResult);
          emitCodeGraphMilestone(context, {
            kind: "analysis.ready",
            subsystemCount: existingResult.root.nodes.length,
            ...(existingResult.meta.reducedAnalysis ? { reduced: true } : {}),
          });
          return;
        }
      }

      // Nothing reusable was found (or a forced rebuild): a real `localPath`
      // and a live session are needed to actually run the analyzer.
      // Confirmed real: without this guard, `runAnalysis` tried to mkdir a
      // workspace-relative path with an empty root, producing a confusing
      // "/.neodevex: Read-only file system" error instead of a clear one.
      // Same scope boundary as Watch KT: analysis needs a live sandbox to
      // actually run in.
      if (!snapshot.localPath || !conversationUrl || !sessionApiKey) {
        useCodeGraphStore
          .getState()
          .setError(
            targetKey,
            "Open this repository's conversation to build the code graph — analysis needs a live workspace session.",
          );
        settle();
        return;
      }

      try {
        emitCodeGraphMilestone(context, { kind: "analysis.started" });
        const result = await runAnalysis({
          ...shared,
          hints: toSubsystemHints(knowledgeState?.knowledge ?? undefined),
          onProgress: (progress) => {
            useCodeGraphStore.getState().setProgress(displayKey, progress);
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

        useCodeGraphStore.getState().setReady(targetKey, result);
        if (retargeted) {
          // The graph now describes HEAD: say so without waiting for the
          // freshness effect to re-check it on the new key.
          useCodeGraphStore
            .getState()
            .setFreshness(
              targetKey,
              evaluateFreshness(target.commitSha, target.commitSha),
            );
        }
        settle();
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
            commitSha: target.commitSha,
            nodeCount: result.root.nodes.length,
            edgeCount: result.root.edges.length,
            analyzerVersion: "understand-anything",
            outputPath: codegraphStoragePrefix(
              persistenceIds.workspaceId,
              persistenceIds.repositoryUuid,
              target.commitSha,
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
        // A failed rebuild must not discard a graph that was already valid
        // and on screen -- `keepOnScreen` exists precisely so the user keeps
        // looking at real data while a rebuild runs in the background, and
        // `settle()` unconditionally pinning + resetting `key` here would
        // throw that graph away over a transient failure (e.g. a sandbox
        // timeout), replacing it with a full error screen. Just clear the
        // spinner and drop the orphaned retargeted attempt instead; the
        // failure is still recorded below via the activity feed.
        if (keepOnScreen) {
          useCodeGraphStore.getState().endRebuild(key);
          if (retargeted) useCodeGraphStore.getState().reset(targetKey);
        } else {
          useCodeGraphStore.getState().setError(targetKey, reason);
          settle();
        }
        emitCodeGraphMilestone(context, { kind: "analysis.failed", reason });
      }
    },
    [snapshot, docsSnapshot, knowledgeState, key, backend.id],
  );

  // On a fresh page load (no in-memory graph state yet), check whether a
  // graph already exists for this commit before showing "Build code graph".
  // `openExistingAnalysis` (via `analyze(false)`) checks the Supabase Storage
  // mirror first, so this can succeed even without a live agent-server
  // session -- it only falls back to needing one if that commit was analyzed
  // before Storage mirroring existed, or the mirror upload failed.
  //
  // A cold-rehydrated (Supabase) Docs entry has `localPath: ""`, so it can't
  // use `resolvePersistenceIds` here -- that resolver needs a real local
  // path to re-derive the same workspace id a live generation wrote the
  // snapshot under, and an empty path produces a *different* id that never
  // matches the stored row (confirmed: this is why a real, previously
  // generated graph stayed permanently invisible on every cold load). The
  // read-only `resolveOrgId` + `findRepositoryUuid` pair Knowledge docs
  // already use for the same cold-rehydration problem needs neither, and
  // `findSnapshotWorkspaceId` then asks the snapshot row itself which
  // workspace actually generated it.
  React.useEffect(() => {
    if (!snapshot || !key || state) return;
    let cancelled = false;
    (async () => {
      const orgId = await resolveOrgId();
      if (!orgId || cancelled) return;
      const repositoryUuid = await findRepositoryUuid(
        orgId,
        snapshot.owner,
        snapshot.repo,
        snapshot.localPath || undefined,
      );
      if (!repositoryUuid || cancelled) return;
      const workspaceId =
        await codegraphPersistenceRepository.findSnapshotWorkspaceId(
          repositoryUuid,
          snapshot.commitSha,
        );
      if (!workspaceId || cancelled) return;
      analyze(false, { workspaceId, repositoryUuid });
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
      // The canvas drills on single AND double click, so one real double
      // click reaches here three times while the first shard fetch is still
      // in flight — it navigates when that fetch lands.
      if (current?.loadingParents.includes(nodeId)) return;
      useCodeGraphStore.getState().beginLoadLevel(key, nodeId);
      const level = await handle.loadLevel(nodeId);
      if (!level) {
        // `loadLevel` swallows the underlying fetch/storage error and returns
        // null; without this the click would look dead.
        useCodeGraphStore.getState().failLevel(key, nodeId);
        return;
      }
      useCodeGraphStore.getState().setLevel(key, nodeId, level);
      useCodeGraphStore.getState().navigateTo(key, nodeId);
    },
    [key, handle],
  );

  // --- Search --------------------------------------------------------------
  // `searchIndex` only lands in the store once the fetch resolves, so without
  // tracking the in-flight request separately, each keystroke typed before
  // that first response arrives re-fires the same fetch of `search.json` —
  // the largest artefact the analyzer produces.
  const searchIndexLoadingRef = React.useRef<Set<string>>(new Set());
  const ensureSearchIndex = React.useCallback(async () => {
    if (!key || !handle) return;
    if (useCodeGraphStore.getState().byKey[key]?.searchIndex) return;
    if (searchIndexLoadingRef.current.has(key)) return;
    searchIndexLoadingRef.current.add(key);
    try {
      const entries = await handle.loadSearchIndex();
      useCodeGraphStore.getState().setSearchIndex(key, entries);
    } finally {
      searchIndexLoadingRef.current.delete(key);
    }
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
      // first so selecting it actually reveals something. A subsystem's
      // `parentId` is the empty string (the system root), which is falsy but
      // still means "navigate" whenever the current view isn't already the
      // root — otherwise selecting a subsystem while drilled into another
      // level would select a node the open level doesn't contain, and the
      // details panel would silently fail to appear.
      if (entry.parentId) {
        await drillDown(entry.parentId);
      } else {
        useCodeGraphStore.getState().navigateTo(key, null);
      }
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
          {rehydrationChecked ? (
            <p className="text-sm text-[var(--oh-muted)]">
              {t(I18nKey.CODEGRAPH$NO_KNOWLEDGE)}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm text-[var(--oh-muted)]">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {t(I18nKey.KT$STARTING)}
            </p>
          )}
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

  const failedLevelId = state?.levelError ?? null;
  const failedLevelName = failedLevelId
    ? (level?.nodes.find((node) => node.id === failedLevelId)?.name ??
      level?.crumbs.find((crumb) => crumb.id === failedLevelId)?.name ??
      failedLevelId)
    : null;

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
            className="size-7 text-[var(--error-500)]"
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
              hiddenTypes={selectHiddenTypes(state)}
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
              searchIndexReady={state.searchIndex !== null}
              onSelectResult={selectSearchResult}
              levelNodes={level.nodes}
              onRebuild={() => analyze(true)}
              isRebuilding={Boolean(state.rebuilding)}
              isLoadingLevel={state.loadingParents.length > 0}
              levelError={
                failedLevelId && failedLevelName
                  ? { parentId: failedLevelId, name: failedLevelName }
                  : null
              }
              onRetryLevel={drillDown}
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
