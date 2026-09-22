import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useSearchParams } from "react-router";
import { Player, type PlayerRef } from "@remotion/player";
import {
  AlertTriangle,
  FileText,
  Loader2,
  Video,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useKnowledgeStore } from "#/stores/knowledge-store";
import { I18nKey } from "#/i18n/declaration";
import { MarkdownRenderer } from "#/components/features/markdown/markdown-renderer";
import { mermaidAwareCode } from "#/components/features/markdown/mermaid-code-block";
import { KtBreadcrumb } from "#/components/features/kt-video/kt-breadcrumb";
import { readSnapshotFiles } from "#/lib/knowledge/workspace-file-reader";
import {
  buildKtManifestFromKnowledgePage,
  type KtManifest,
} from "#/lib/kt-video/build-manifest";
import { findConceptFlow } from "#/lib/kt-video/concept-flow";
import { narrateManifest } from "#/lib/kt-video/narrate-manifest";
import { useSceneNarration } from "#/lib/kt-video/use-scene-narration";
import { KtVideoComposition } from "#/components/features/kt-video/kt-video-composition";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { useCodeGraphStore } from "#/stores/codegraph-store";
import { codeGraphKey } from "#/lib/codegraph/codegraph-types";
import { workspaceIdForSnapshot } from "#/lib/codegraph/workspace-identity";
import { useKnowledgeRehydration } from "#/lib/knowledge/use-knowledge-rehydration";

type ViewMode = "read" | "watch";

const EMPTY_MANIFEST: KtManifest = {
  repo_name: "",
  scenes: [],
  totalFrames: 1,
  fps: 30,
  repo_files: [],
};

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
  const [manifest, setManifest] = useState<ReturnType<
    typeof buildKtManifestFromKnowledgePage
  > | null>(null);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const playerRef = useRef<PlayerRef>(null);
  const [narrationEnabled, setNarrationEnabled] = useState(false);
  const speechSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

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

  useSceneNarration(
    manifest ?? EMPTY_MANIFEST,
    playerRef,
    narrationEnabled && speechSupported && mode === "watch",
  );

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
  // knows needs a fresh manifest — going through handleWatchKt there would
  // check the `manifest` state closed over at the time that effect fired,
  // which is one render stale relative to the `setManifest(null)` call just
  // above it (state updates don't apply to an already-created closure), so
  // its `if (manifest) return;` guard would see the *previous* page's
  // manifest and wrongly skip regeneration.
  const generateWatchManifest = async (
    targetPage: NonNullable<typeof page>,
    targetState: NonNullable<typeof state>,
  ) => {
    if (!targetState.conversationUrl || !targetState.sessionApiKey) {
      // A cold-rehydrated (Supabase) entry has real Docs content but no live
      // session — Watch KT needs one to download real file content. Real
      // scope boundary, not a bug: open/reopen this repo's conversation.
      displayErrorToast(
        "Open this repository's conversation to watch KT — video needs a live workspace session.",
      );
      setMode("read");
      return;
    }
    // A page switch (or a second click that slips past the disabled button)
    // can start a newer generation before an older one for a previous page
    // has resolved. Without this id, whichever call's `finally` runs first
    // flips `isGeneratingVideo` back off while the other is still running,
    // and a slow older call's `setManifest` can land after the newer one's
    // and silently show the wrong page's video. Every state write below is
    // gated on this call still being the most recently started one.
    const generationId = ++activeGenerationIdRef.current;
    const isStale = () => activeGenerationIdRef.current !== generationId;
    setIsGeneratingVideo(true);
    try {
      const { contents: fileContents } = await readSnapshotFiles(
        targetState.snapshot,
        targetState.conversationUrl,
        targetState.sessionApiKey,
        targetPage.relevantFiles.map((f) => f.path),
      );
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
        displayErrorToast(
          `Couldn't load this page's source files — showing a summary only.`,
        );
      }
      const conceptHops = codeGraphHandle
        ? await findConceptFlow(
            codeGraphHandle,
            targetPage.relevantFiles.map((f) => f.path),
          ).catch(() => [])
        : [];
      if (isStale()) return;
      const builtManifest = buildKtManifestFromKnowledgePage(
        targetPage,
        fileContents,
        Object.keys(fileContents),
        5,
        conceptHops,
      );
      // Best-effort tutorial-style narration pass — never blocks or fails
      // video generation; any failure leaves the deterministic template
      // narration already in the manifest untouched.
      const narrated = await narrateManifest(
        builtManifest,
        targetState.snapshot,
      ).catch(() => builtManifest);
      if (isStale()) return;
      setManifest(narrated);
    } catch (error) {
      if (isStale()) return;
      displayErrorToast(error instanceof Error ? error.message : String(error));
      setMode("read");
    } finally {
      if (!isStale()) {
        setIsGeneratingVideo(false);
      }
    }
  };

  const handleWatchKt = async () => {
    if (!page || !state) return;
    setMode("watch");
    if (manifest) return;
    await generateWatchManifest(page, state);
  };

  // This route (`kt/:repositoryId/:pageId`) is reused across navigations
  // between pages of the same repo — React doesn't remount just because
  // `:pageId` changed. Without this, `manifest` from the previous page would
  // stay set, so clicking Watch KT (or the auto-watch deep link) for the new
  // page would hit the `if (manifest) return;` guard below and silently keep
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
    setManifest(null);
    autoWatchStarted.current = false;
    if (mode === "watch" && page && state) {
      autoWatchStarted.current = true;
      void generateWatchManifest(page, state);
    }
  }, [decodedRepositoryId, page?.id]);

  useEffect(() => {
    // `?view=watch` should behave exactly like pressing Watch KT, which means
    // building the manifest — not just flipping the toggle onto an empty player.
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
                onClick={() => setNarrationEnabled((v) => !v)}
                disabled={!speechSupported}
                aria-pressed={narrationEnabled}
                data-testid="kt-page-narration-toggle"
                title={
                  speechSupported
                    ? t(I18nKey.KT$NARRATION_TOOLTIP_ENABLED)
                    : t(I18nKey.KT$NARRATION_TOOLTIP_UNSUPPORTED)
                }
                className="flex items-center gap-1.5 rounded-md border border-[var(--oh-border)] px-3 py-1.5 text-sm text-[var(--oh-foreground)] hover:bg-[var(--oh-interactive-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {narrationEnabled ? (
                  <Volume2 className="size-3.5" aria-hidden />
                ) : (
                  <VolumeX className="size-3.5" aria-hidden />
                )}
              </button>
            ) : null}
          </div>
        </div>

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
          <div className="flex items-center justify-center bg-black p-4">
            {isGeneratingVideo || !manifest ? (
              <p className="flex items-center gap-2 py-16 text-sm text-[var(--oh-muted)]">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {t(I18nKey.KT$GENERATING_VIDEO)}
              </p>
            ) : (
              <div className="aspect-video w-full max-w-3xl overflow-hidden rounded-lg shadow-2xl">
                <Player
                  ref={playerRef}
                  component={KtVideoComposition}
                  inputProps={{ manifest }}
                  durationInFrames={Math.max(1, manifest.totalFrames)}
                  compositionWidth={1920}
                  compositionHeight={1080}
                  fps={manifest.fps}
                  style={{ width: "100%", height: "100%" }}
                  controls
                  loop
                />
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default KtPage;
