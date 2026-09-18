import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { AlertTriangle, FileText, Loader2 } from "lucide-react";
import { useKnowledgeStore } from "#/stores/knowledge-store";
import { KnowledgeTabs } from "#/components/features/knowledge/knowledge-tabs";
import { useNavigation } from "#/context/navigation-context";
import { I18nKey } from "#/i18n/declaration";
import { KtBreadcrumb } from "#/components/features/kt-video/kt-breadcrumb";
import { KtRefreshCadence } from "#/components/features/kt-video/kt-refresh-cadence";
import type { KnowledgeImportance } from "#/lib/knowledge/knowledge-engine";
import { useKnowledgeRehydration } from "#/lib/knowledge/use-knowledge-rehydration";

const IMPORTANCE_KEY: Record<KnowledgeImportance, string> = {
  high: I18nKey.KT$IMPORTANCE_HIGH,
  medium: I18nKey.KT$IMPORTANCE_MEDIUM,
  low: I18nKey.KT$IMPORTANCE_LOW,
};

const IMPORTANCE_CLASSNAME: Record<KnowledgeImportance, string> = {
  high: "bg-[var(--primary-bg-subtle)] text-[var(--primary-500)]",
  medium: "bg-[var(--warning-bg-subtle)] text-[var(--warning-500)]",
  low: "bg-[var(--oh-surface)] text-[var(--oh-muted)]",
};

function KtRepository() {
  const { t } = useTranslation("openhands");
  const { navigate } = useNavigation();
  const { repositoryId } = useParams<{ repositoryId: string }>();
  const decodedId = repositoryId ? decodeURIComponent(repositoryId) : undefined;
  const state = useKnowledgeStore((s) =>
    decodedId ? s.byRepositoryId[decodedId] : undefined,
  );
  const rehydrationChecked = useKnowledgeRehydration(decodedId);

  if (!state?.knowledge) {
    // A failed generation leaves a real entry with `knowledge: null`. Saying
    // "hasn't been generated yet" there hides the actual reason it failed,
    // which is the only thing that tells the user what to do next.
    const failureMessage = state?.status === "error" ? state.error : null;
    return (
      <main className="min-h-full" data-testid="kt-repository">
        <div className="mx-auto max-w-4xl p-6">
          <KtBreadcrumb />
          {failureMessage ? (
            <p
              data-testid="kt-repository-error"
              role="alert"
              className="text-sm text-[var(--error-500)]"
            >
              {failureMessage}
            </p>
          ) : null}
          {!failureMessage && rehydrationChecked && (
            <p className="text-sm text-[var(--oh-muted)]">
              {t(I18nKey.KT$NOT_FOUND)}
            </p>
          )}
          {!failureMessage && !rehydrationChecked && (
            <p className="flex items-center gap-2 text-sm text-[var(--oh-muted)]">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {t(I18nKey.KT$STARTING)}
            </p>
          )}
        </div>
      </main>
    );
  }

  const { knowledge, qualityFlags } = state;
  const pagesById = new Map(knowledge.pages.map((page) => [page.id, page]));
  const sectioned = new Set(
    knowledge.sections.flatMap((section) => section.pageIds),
  );
  const unsectionedPages = knowledge.pages.filter(
    (page) => !sectioned.has(page.id),
  );
  const flagDetailsByPageId = new Map<string, string>();
  for (const flag of qualityFlags) {
    const existing = flagDetailsByPageId.get(flag.pageId);
    flagDetailsByPageId.set(
      flag.pageId,
      existing ? `${existing}\n${flag.detail}` : flag.detail,
    );
  }

  return (
    <main className="min-h-full" data-testid="kt-repository">
      <div className="mx-auto max-w-4xl p-6">
        <KtBreadcrumb
          repositoryLabel={`${state.snapshot.owner}/${state.snapshot.repo}`}
        />

        <div className="mb-1 flex items-start justify-between gap-4">
          <h1 className="text-xl font-semibold text-[var(--oh-foreground)]">
            {knowledge.title}
          </h1>
          <KtRefreshCadence repositoryId={state.snapshot.repositoryId} />
        </div>
        <p className="mt-1 mb-4 text-sm text-[var(--oh-muted)]">
          {knowledge.summary}
        </p>

        <KnowledgeTabs
          repositoryId={state.snapshot.repositoryId}
          active="docs"
        />

        <p className="mt-4 mb-6 font-mono text-xs text-[var(--oh-muted)]">
          {state.snapshot.owner}/{state.snapshot.repo}@
          {state.snapshot.commitSha.slice(0, 7)}
        </p>

        {knowledge.sections.map((section) => (
          <div key={section.id} className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
              {section.title}
            </h2>
            <div className="flex flex-col gap-1.5">
              {section.pageIds.map((pageId) => {
                const page = pagesById.get(pageId);
                if (!page) return null;
                return (
                  <button
                    key={pageId}
                    type="button"
                    onClick={() =>
                      navigate?.(
                        `/kt/${encodeURIComponent(state.snapshot.repositoryId)}/${encodeURIComponent(pageId)}`,
                      )
                    }
                    className="flex items-center gap-2 rounded-md border border-[var(--oh-border)] px-3 py-2 text-left text-sm text-[var(--oh-foreground)] hover:bg-[var(--oh-interactive-hover)]"
                  >
                    <FileText
                      className="size-3.5 shrink-0 text-[var(--oh-muted)]"
                      aria-hidden
                    />
                    <span className="flex-1 truncate">{page.title}</span>
                    {flagDetailsByPageId.has(pageId) && (
                      <span
                        className="shrink-0"
                        title={flagDetailsByPageId.get(pageId)}
                      >
                        <AlertTriangle
                          className="size-3.5 text-[var(--warning-500)]"
                          aria-label={t(I18nKey.KT$QUALITY_FLAG_BADGE)}
                        />
                      </span>
                    )}
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${IMPORTANCE_CLASSNAME[page.importance]}`}
                    >
                      {t(IMPORTANCE_KEY[page.importance])}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {unsectionedPages.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {unsectionedPages.map((page) => (
              <button
                key={page.id}
                type="button"
                onClick={() =>
                  navigate?.(
                    `/kt/${encodeURIComponent(state.snapshot.repositoryId)}/${encodeURIComponent(page.id)}`,
                  )
                }
                className="flex items-center gap-2 rounded-md border border-[var(--oh-border)] px-3 py-2 text-left text-sm text-[var(--oh-foreground)] hover:bg-[var(--oh-interactive-hover)]"
              >
                <FileText
                  className="size-3.5 shrink-0 text-[var(--oh-muted)]"
                  aria-hidden
                />
                <span className="flex-1 truncate">{page.title}</span>
                {flagDetailsByPageId.has(page.id) && (
                  <span
                    className="shrink-0"
                    title={flagDetailsByPageId.get(page.id)}
                  >
                    <AlertTriangle
                      className="size-3.5 text-[var(--warning-500)]"
                      aria-label={t(I18nKey.KT$QUALITY_FLAG_BADGE)}
                    />
                  </span>
                )}
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${IMPORTANCE_CLASSNAME[page.importance]}`}
                >
                  {t(IMPORTANCE_KEY[page.importance])}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export default KtRepository;
