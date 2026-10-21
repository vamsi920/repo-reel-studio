import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useSearchParams } from "react-router";
import { Player, type PlayerRef } from "@remotion/player";
import {
  AlertCircle,
  AlertTriangle,
  Captions,
  FileText,
  Loader2,
  Video,
} from "lucide-react";
import { useKnowledgeStore } from "#/stores/knowledge-store";
import { I18nKey } from "#/i18n/declaration";
import { MarkdownRenderer } from "#/components/features/markdown/markdown-renderer";
import { mermaidAwareCode } from "#/components/features/markdown/mermaid-code-block";
import { KtBreadcrumb } from "#/components/features/kt-video/kt-breadcrumb";
import { readSnapshotFiles } from "#/lib/knowledge/workspace-file-reader";
import { readGithubFiles } from "#/lib/knowledge/github-file-reader";
import { findConceptFlow } from "#/lib/kt-video/concept-flow";
import {
  buildTutorial,
  type TutorialProgress,
} from "#/lib/kt-video/generate-tutorial";
import {
  getCachedTutorial,
  readPersistedScript,
  setCachedTutorial,
  tutorialCacheKey,
  writePersistedScript,
} from "#/lib/kt-video/tutorial-cache";
import type { KtTutorial } from "#/lib/kt-video/tutorial-types";
import DeepWikiService from "#/api/deepwiki-service/deepwiki-service.api";
import { withAppRoute } from "#/lib/model-routing/app-side";
import { resolveDeepWikiRepoTarget } from "#/lib/knowledge/deepwiki-repo-target";
import { KtTutorialComposition } from "#/components/features/kt-video/tutorial/tutorial-composition";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { useCodeGraphStore } from "#/stores/codegraph-store";
import { codeGraphKey } from "#/lib/codegraph/codegraph-types";
import { workspaceIdForSnapshot } from "#/lib/codegraph/workspace-identity";
import { useKnowledgeRehydration } from "#/lib/knowledge/use-knowledge-rehydration";

type ViewMode = "read" | "watch";

function KtPage() {
  const { t } = useTranslation("openhands");
  const { repositoryId, pageId } = useParams<{
    repositoryId: string;
    pageId: string;
  }>();
  const decodedRepositoryId = repositoryId
    ? decodeURIComponent(repositoryId)
    : undefined;
  const state = useKnowledgeStore((s) =>
    decodedRepositoryId ? s.byRepositoryId[decodedRepositoryId] : undefined,
  );
  // A deep link / reload lands here with an empty store even for a repo that
  // was generated earlier; this loads it the same way the Docs tab does.
  const rehydrationChecked = useKnowledgeRehydration(decodedRepositoryId);

  // Navigation compatibility only: the Knowledge "Video KT" tab and CodeGraph's
  // [Watch KT] deeplink both point here with `?view=watch`, so arriving that way
  // opens the existing watch mode instead of landing on Read. The watch
  // pipeline itself is untouched.
  const [searchParams] = useSearchParams();
  const wantsWatch = searchParams.get("view") === "watch";

  const [mode, setMode] = useState<ViewMode>(wantsWatch ? "watch" : "read");
  const [tutorial, setTutorial] = useState<KtTutorial | null>(null);
  const [progress, setProgress] = useState<TutorialProgress | null>(null);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const playerRef = useRef<PlayerRef>(null);

  const page = useMemo(
    () =>
      state?.knowledge?.pages.find(
        (p) => p.id === (pageId ? decodeURIComponent(pageId) : undefined),
      ) ?? null,
    [state, pageId],
  );

  const pageQualityFlags = useMemo(
    () => state?.qualityFlags.filter((flag) => flag.pageId === page?.id) ?? [],
    [state, page],
  );

  const autoWatchStarted = useRef(false);
  const activeGenerationIdRef = useRef(0);

  // A cached CodeGraph analysis (from an earlier CodeGraph visit — this
  // never triggers a fresh one) lets Watch KT show a real multi-file flow
  // scene. Read-only lookup; absent is a normal, silently-skipped case.
  const codeGraphHandle = useCodeGraphStore((s) => {
    if (!state?.snapshot) return undefined;
    const key = codeGraphKey(
      workspaceIdForSnapshot(state.snapshot),
      state.snapshot.repositoryId,
      state.snapshot.commitSha,
    );
    return s.handles[key];
  });

  // The actual generation work, factored out of handleWatchKt so the
  // page-change effect below can invoke it directly for a page it already
  // knows needs a fresh tutorial — going through handleWatchKt there would
  // check the `manifest` state closed over at the time that effect fired,
  // which is one render stale relative to the `setTutorial(null)` call just
  // above it (state updates don't apply to an already-created closure), so
  // its `if (tutorial) return;` guard would see the *previous* page's
  // manifest and wrongly skip regeneration.
  const generateWatchManifest = async (
    targetPage: NonNullable<typeof page>,
    targetState: NonNullable<typeof state>,
  ) => {
    const cacheKey = tutorialCacheKey(
      decodedRepositoryId ?? targetState.snapshot.repositoryId,
      targetPage.id,
      targetState.snapshot.commitSha,
    );
    const cached = getCachedTutorial(cacheKey);
    if (cached) {
      setTutorial(cached);
      return;
    }
    // A page switch (or a second click that slips past the disabled button)
    // can start a newer generation before an older one for a previous page
    // has resolved. Without this id, whichever call's `finally` runs first
    // flips `isGeneratingVideo` back off while the other is still running,
    // and a slow older call's `setTutorial` can land after the newer one's
    // and silently show the wrong page's video. Every state write below is
    // gated on this call still being the most recently started one.
    const generationId = ++activeGenerationIdRef.current;
    const isStale = () => activeGenerationIdRef.current !== generationId;
    setIsGeneratingVideo(true);
    setProgress({ stage: "diagrams" });
    try {
      // A live conversation reads the exact checkout; saved (Supabase)
      // docs have no session, so the code is read from GitHub at the same
      // commit instead of refusing to play.
      const relevantPaths = targetPage.relevantFiles.map((f) => f.path);
      const { contents: fileContents } =
        targetState.conversationUrl && targetState.sessionApiKey
          ? await readSnapshotFiles(
              targetState.snapshot,
              targetState.conversationUrl,
              targetState.sessionApiKey,
              relevantPaths,
            )
          : await readGithubFiles(targetState.snapshot, relevantPaths);
      if (isStale()) return;
      if (
        targetPage.relevantFiles.length > 0 &&
        Object.keys(fileContents).length === 0
      ) {
        // Every declared source file failed to load — the video would
        // otherwise render as a near-empty single scene with no visible
        // error, which is exactly the "not generating at all" failure mode
        // this is fixing. Still render what we can (intro/diagram scenes),
        // but say so.
        displayErrorToast(t(I18nKey.KT$WATCH_SOURCE_FILES_UNAVAILABLE));
      }
      const conceptHops = codeGraphHandle
        ? await findConceptFlow(
            codeGraphHandle,
            targetPage.relevantFiles.map((f) => f.path),
          ).catch(() => [])
        : [];
      if (isStale()) return;

      // The script is written by the same model route the KT docs use,
      // through DeepWiki (which holds the provider keys). The target is
      // resolved once; a failure here simply means no LLM, and the
      // deterministic script takes over inside buildTutorial.
      const target = await resolveDeepWikiRepoTarget(
        targetState.snapshot,
      ).catch(() => null);
      const chat = target
        ? (prompt: string) =>
            withAppRoute("narration", (route) =>
              DeepWikiService.chatCompletion({
                repo_url: target.repo_url,
                type: target.type,
                token: target.token,
                provider: route.provider,
                model: route.model,
                messages: [{ role: "user", content: prompt }],
              }),
            )
        : null;

      const siblingPageTitles = targetState.knowledge?.pages
        .filter((p) => p.id !== targetPage.id)
        .map((p) => p.title);
      const persistedScript = readPersistedScript(cacheKey);
      const built = await buildTutorial(
        {
          script: persistedScript,
          onScript: (script) =>
            writePersistedScript(cacheKey, {
              chapters: script.chapters,
              source: script.source,
              wordCount: script.wordCount,
            }),
          repoName: `${targetState.snapshot.owner}/${targetState.snapshot.repo}`,
          commitSha: targetState.snapshot.commitSha,
          page: targetPage,
          repoSummary: targetState.knowledge?.summary,
          siblingPageTitles,
          files: fileContents,
          conceptHops: conceptHops.map((hop) => ({
            path: hop.path,
            startLine: hop.startLine,
            endLine: hop.endLine,
            symbol: hop.symbol,
          })),
          chat,
          // Narration is switched off for now; the TTS pipeline in
          // tts.ts stays in place for when a voice is chosen.
          narrate: false,
        },
        (next) => {
          if (!isStale()) setProgress(next);
        },
      );
      if (isStale()) return;
      setCachedTutorial(cacheKey, built);
      setTutorial(built);
    } catch (error) {
      if (isStale()) return;
      displayErrorToast(error instanceof Error ? error.message : String(error));
      setMode("read");
    } finally {
      if (!isStale()) {
        setIsGeneratingVideo(false);
        setProgress(null);
      }
    }
  };

  const handleWatchKt = async () => {
    if (!page || !state) return;
    setMode("watch");
    if (tutorial) return;
    await generateWatchManifest(page, state);
  };

  // This route (`kt/:repositoryId/:pageId`) is reused across navigations
  // between pages of the same repo — React doesn't remount just because
  // `:pageId` changed. Without this, `tutorial` from the previous page would
  // stay set, so clicking Watch KT (or the auto-watch deep link) for the new
  // page would hit the `if (tutorial) return;` guard below and silently keep
  // showing the previous page's video under the new page's title. Keyed on
  // repositoryId+pageId together, not pageId alone: two different
  // repositories can generate a page with the same short slug (e.g.
  // "overview"), and an in-place navigation between them must still clear
  // the previous repository's stale manifest.
  const previousPageKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const currentPageKey = page
      ? `${decodedRepositoryId ?? ""}::${page.id}`
      : null;
    if (previousPageKeyRef.current === currentPageKey) return;
    const isPageChange = previousPageKeyRef.current !== null;
    previousPageKeyRef.current = currentPageKey;
    if (!isPageChange) return;
    setTutorial(null);
    autoWatchStarted.current = false;
    if (mode === "watch" && page && state) {
      autoWatchStarted.current = true;
      void generateWatchManifest(page, state);
    }
  }, [decodedRepositoryId, page?.id]);

  useEffect(() => {
    // `?view=watch` should behave exactly like pressing Watch KT, which means
    // building the tutorial — not just flipping the toggle onto an empty player.
    if (!wantsWatch || autoWatchStarted.current) return;
    if (!page || !state) return;
    autoWatchStarted.current = true;
    handleWatchKt();
  }, [wantsWatch, page, state]);

  if (!state?.knowledge || !page) {
    // A failed generation leaves a real entry with `knowledge: null` — the
    // Docs tab (kt-repository.tsx) already shows this real reason instead of
    // a generic "not found" for the exact same store entry; this route read
    // the same state and hid it.
    const failureMessage = state?.status === "error" ? state.error : null;
    return (
      <main className="min-h-full" data-testid="kt-page">
        <div className="mx-auto max-w-4xl p-6">
          <KtBreadcrumb />
          {failureMessage ? (
            <p
              data-testid="kt-page-error"
              role="alert"
              className="text-sm text-[var(--error-500)]"
            >
              {failureMessage}
            </p>
          ) : rehydrationChecked ? (
            <p className="text-sm text-[var(--oh-muted)]">
              {t(I18nKey.KT$PAGE_NOT_FOUND)}
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

  return (
    <main className="min-h-full" data-testid="kt-page">
      <div className="mx-auto max-w-4xl p-6">
        <KtBreadcrumb
          repositoryLabel={`${state.snapshot.owner}/${state.snapshot.repo}`}
          repositoryId={decodedRepositoryId}
          pageTitle={page.title}
        />

        <div className="mb-4 flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold text-[var(--oh-foreground)]">
            {page.title}
          </h1>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setMode("read")}
              data-testid="kt-page-read-button"
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm ${
                mode === "read"
                  ? "border-[var(--primary-500)] bg-[var(--primary-bg-subtle)] text-[var(--primary-500)]"
                  : "border-[var(--oh-border)] text-[var(--oh-foreground)] hover:bg-[var(--oh-interactive-hover)]"
              }`}
            >
              <FileText className="size-3.5" aria-hidden />
              {t(I18nKey.KT$READ)}
            </button>
            <button
              type="button"
              onClick={handleWatchKt}
              disabled={isGeneratingVideo}
              data-testid="kt-page-watch-button"
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                mode === "watch"
                  ? "border-[var(--primary-500)] bg-[var(--primary-bg-subtle)] text-[var(--primary-500)]"
                  : "border-[var(--oh-border)] text-[var(--oh-foreground)] hover:bg-[var(--oh-interactive-hover)]"
              }`}
            >
              <Video className="size-3.5" aria-hidden />
              {t(I18nKey.KT$WATCH_KT)}
            </button>
            {mode === "watch" ? (
              <button
                type="button"
                onClick={() => setCaptionsEnabled((v) => !v)}
                aria-pressed={captionsEnabled}
                data-testid="kt-page-captions-toggle"
                title={t(I18nKey.KT$TUTORIAL_CAPTIONS)}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm ${
                  captionsEnabled
                    ? "border-[var(--primary-500)] bg-[var(--primary-bg-subtle)] text-[var(--primary-500)]"
                    : "border-[var(--oh-border)] text-[var(--oh-foreground)] hover:bg-[var(--oh-interactive-hover)]"
                }`}
              >
                <Captions className="size-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>

        {state.status === "error" && state.error && (
          // Same regeneration-failure case handled in kt-repository.tsx: a
          // failed regenerate leaves `knowledge` (and this page) intact, so
          // the early-return branch above never sees it and the one-shot
          // toast has already faded by the time this route is revisited.
          <div
            data-testid="kt-page-regeneration-error"
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-md border border-[var(--error-500)] bg-[var(--error-bg-subtle)] px-3 py-2 text-sm text-[var(--oh-foreground)]"
          >
            <AlertCircle
              className="size-4 shrink-0 text-[var(--error-500)]"
              aria-hidden
            />
            <div className="flex-1">
              <p className="font-semibold text-[var(--error-500)]">
                {t(I18nKey.KT$REGENERATION_FAILED_BANNER_TITLE)}
              </p>
              <p className="mt-0.5 text-[var(--oh-muted)]">{state.error}</p>
            </div>
          </div>
        )}

        {pageQualityFlags.length > 0 && (
          <div
            data-testid="kt-page-quality-flags"
            className="mb-4 flex items-start gap-2 rounded-md border border-[var(--warning-500)] bg-[var(--warning-bg-subtle)] px-3 py-2 text-xs text-[var(--oh-foreground)]"
          >
            <AlertTriangle
              className="size-4 shrink-0 text-[var(--warning-500)]"
              aria-hidden
            />
            <div className="flex-1">
              <p className="font-semibold text-[var(--warning-500)]">
                {t(I18nKey.KT$QUALITY_FLAG_BANNER_TITLE)}
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {pageQualityFlags.map((flag) => (
                  <li key={flag.kind}>{flag.detail}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {mode === "read" ? (
          <div
            className={`
              prose prose-sm max-w-none
              [--tw-prose-body:var(--oh-foreground)]
              [--tw-prose-headings:var(--oh-foreground)]
              [--tw-prose-bold:var(--oh-foreground)]
              [--tw-prose-links:var(--primary-500)]
              [--tw-prose-bullets:var(--oh-muted)]
              [--tw-prose-counters:var(--oh-muted)]
              [--tw-prose-hr:var(--oh-border)]
              [--tw-prose-quotes:var(--oh-foreground)]
              [--tw-prose-quote-borders:var(--oh-border)]
              [--tw-prose-captions:var(--oh-muted)]
              [--tw-prose-th-borders:var(--oh-border)]
              [--tw-prose-td-borders:var(--oh-border-subtle)]
              prose-a:no-underline hover:prose-a:underline
              prose-code:before:content-none prose-code:after:content-none
            `}
          >
            <MarkdownRenderer
              content={page.contentMarkdown}
              includeStandard
              includeHeadings
              components={{ code: mermaidAwareCode }}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 bg-black p-4">
            {isGeneratingVideo || !tutorial ? (
              <p
                className="flex items-center gap-2 py-16 text-sm text-[var(--oh-muted)]"
                data-testid="kt-page-generating"
                role="status"
              >
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {progress?.stage === "planning"
                  ? t(I18nKey.KT$TUTORIAL_PROGRESS_PLANNING)
                  : progress?.stage === "writing"
                    ? t(I18nKey.KT$TUTORIAL_PROGRESS_WRITING, {
                        completed: Math.min(
                          (progress.completed ?? 0) + 1,
                          progress.total ?? 1,
                        ),
                        total: progress.total ?? 1,
                      })
                    : progress?.stage === "narrating"
                      ? t(I18nKey.KT$TUTORIAL_PROGRESS_NARRATING, {
                          completed: progress.completed ?? 0,
                          total: progress.total ?? 0,
                        })
                      : progress?.stage === "diagrams"
                        ? t(I18nKey.KT$TUTORIAL_PROGRESS_DIAGRAMS)
                        : t(I18nKey.KT$GENERATING_VIDEO)}
              </p>
            ) : (
              <>
                <div className="aspect-video w-full max-w-5xl overflow-hidden rounded-lg shadow-2xl">
                  <Player
                    ref={playerRef}
                    component={KtTutorialComposition}
                    inputProps={{ tutorial, captions: captionsEnabled }}
                    durationInFrames={Math.max(1, tutorial.totalFrames)}
                    compositionWidth={1920}
                    compositionHeight={1080}
                    fps={tutorial.fps}
                    style={{ width: "100%", height: "100%" }}
                    controls
                  />
                </div>
                <p
                  className="flex w-full max-w-5xl flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--oh-muted)]"
                  data-testid="kt-page-tutorial-meta"
                >
                  <span>
                    {t(I18nKey.KT$TUTORIAL_META, {
                      minutes: Math.round(
                        tutorial.totalFrames / tutorial.fps / 60,
                      ),
                      chapters: tutorial.chapters.length,
                      beats: tutorial.chapters.reduce(
                        (n, c) => n + c.beats.length,
                        0,
                      ),
                    })}
                  </span>
                  {tutorial.scriptSource === "deterministic" ? (
                    <span className="text-[var(--warning-500)]">
                      {t(I18nKey.KT$TUTORIAL_SCRIPT_FALLBACK)}
                    </span>
                  ) : null}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default KtPage;
