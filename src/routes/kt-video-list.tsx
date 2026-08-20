import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { ChevronLeft, Video } from "lucide-react";
import { useKnowledgeStore } from "#/stores/knowledge-store";
import { useNavigation } from "#/context/navigation-context";
import { I18nKey } from "#/i18n/declaration";
import { KnowledgeTabs } from "#/components/features/knowledge/knowledge-tabs";

/**
 * The Video KT tab.
 *
 * Deliberately thin: Video KT already works, as the "watch" mode on a Knowledge
 * page (`kt-page.tsx`). This route adds no video logic of its own — it lists
 * the pages that have one and links into that existing mode via `?view=watch`.
 * Nothing under `src/lib/kt-video/` or `src/components/features/kt-video/` is
 * touched.
 */
function KtVideoList() {
  const { t } = useTranslation("openhands");
  const { navigate } = useNavigation();
  const { repositoryId: rawRepositoryId } = useParams<{
    repositoryId: string;
  }>();
  const repositoryId = rawRepositoryId
    ? decodeURIComponent(rawRepositoryId)
    : "";
  const state = useKnowledgeStore((s) => s.byRepositoryId[repositoryId]);

  return (
    <main className="min-h-full" data-testid="kt-video-list">
      <div className="mx-auto max-w-4xl p-6">
        <button
          type="button"
          onClick={() => navigate?.("/kt")}
          className="mb-3 flex items-center gap-1 text-sm text-[var(--oh-muted)] hover:text-[var(--oh-foreground)]"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {t(I18nKey.KT$BACK_TO_LIST)}
        </button>

        <KnowledgeTabs repositoryId={repositoryId} active="video" />

        {!state?.knowledge ? (
          <p className="pt-6 text-sm text-[var(--oh-muted)]">
            {t(I18nKey.KT$NOT_FOUND)}
          </p>
        ) : (
          <div className="flex flex-col gap-1.5 pt-6">
            {state.knowledge.pages.map((page) => (
              <button
                key={page.id}
                type="button"
                data-testid="kt-video-list-item"
                onClick={() =>
                  navigate?.(
                    `/kt/${encodeURIComponent(repositoryId)}/${encodeURIComponent(page.id)}?view=watch`,
                  )
                }
                className="flex items-center gap-2 rounded-md border border-[var(--oh-border)] px-3 py-2 text-left text-sm text-[var(--oh-foreground)] hover:bg-[var(--oh-interactive-hover)]"
              >
                <Video
                  className="size-3.5 shrink-0 text-[var(--oh-muted)]"
                  aria-hidden
                />
                <span className="flex-1 truncate">{page.title}</span>
                <span className="shrink-0 text-xs text-[var(--oh-muted)]">
                  {t(I18nKey.KT$WATCH_KT)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export default KtVideoList;
