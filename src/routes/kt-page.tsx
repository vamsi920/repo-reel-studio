import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useSearchParams } from "react-router";
import { Player } from "@remotion/player";
import { FileText, Loader2, Video } from "lucide-react";
import { useKnowledgeStore } from "#/stores/knowledge-store";
import { I18nKey } from "#/i18n/declaration";
import { MarkdownRenderer } from "#/components/features/markdown/markdown-renderer";
import { mermaidAwareCode } from "#/components/features/markdown/mermaid-code-block";
import { KtBreadcrumb } from "#/components/features/kt-video/kt-breadcrumb";
import { readSnapshotFiles } from "#/lib/knowledge/workspace-file-reader";
import { buildKtManifestFromKnowledgePage } from "#/lib/kt-video/build-manifest";
import { KtVideoComposition } from "#/components/features/kt-video/kt-video-composition";
import { displayErrorToast } from "#/utils/custom-toast-handlers";

type ViewMode = "read" | "watch";

function KtPage() {
  const { t } = useTranslation("openhands");
  const { repositoryId, pageId } = useParams<{
    repositoryId: string;
    pageId: string;
  }>();
  const state = useKnowledgeStore((s) =>
    repositoryId
      ? s.byRepositoryId[decodeURIComponent(repositoryId)]
      : undefined,
  );

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

  const page = useMemo(
    () =>
      state?.knowledge?.pages.find(
        (p) => p.id === (pageId ? decodeURIComponent(pageId) : undefined),
      ) ?? null,
    [state, pageId],
  );

  const autoWatchStarted = useRef(false);

  const handleWatchKt = async () => {
    if (!page || !state) return;
    setMode("watch");
    if (manifest) return;
    setIsGeneratingVideo(true);
    try {
      const fileContents = await readSnapshotFiles(
        state.snapshot,
        state.conversationUrl,
        state.sessionApiKey,
        page.relevantFiles.map((f) => f.path),
      );
      setManifest(buildKtManifestFromKnowledgePage(page, fileContents));
    } catch (error) {
      displayErrorToast(error instanceof Error ? error.message : String(error));
      setMode("read");
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  useEffect(() => {
    // `?view=watch` should behave exactly like pressing Watch KT, which means
    // building the manifest — not just flipping the toggle onto an empty player.
    if (!wantsWatch || autoWatchStarted.current) return;
    if (!page || !state) return;
    autoWatchStarted.current = true;
    handleWatchKt();
  }, [wantsWatch, page, state]);

  if (!state?.knowledge || !page) {
    return (
      <main className="min-h-full" data-testid="kt-page">
        <div className="mx-auto max-w-4xl p-6">
          <KtBreadcrumb />
          <p className="text-sm text-[var(--oh-muted)]">
            {t(I18nKey.KT$PAGE_NOT_FOUND)}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-full" data-testid="kt-page">
      <div className="mx-auto max-w-4xl p-6">
        <KtBreadcrumb
          repositoryLabel={`${state.snapshot.owner}/${state.snapshot.repo}`}
          repositoryId={repositoryId}
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
              data-testid="kt-page-watch-button"
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm ${
                mode === "watch"
                  ? "border-[var(--primary-500)] bg-[var(--primary-bg-subtle)] text-[var(--primary-500)]"
                  : "border-[var(--oh-border)] text-[var(--oh-foreground)] hover:bg-[var(--oh-interactive-hover)]"
              }`}
            >
              <Video className="size-3.5" aria-hidden />
              {t(I18nKey.KT$WATCH_KT)}
            </button>
          </div>
        </div>

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
