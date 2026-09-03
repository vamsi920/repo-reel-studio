import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { FileText, Loader2 } from "lucide-react";
import { useKnowledgeStore } from "#/stores/knowledge-store";
import { KnowledgeTabs } from "#/components/features/knowledge/knowledge-tabs";
import { useNavigation } from "#/context/navigation-context";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { I18nKey } from "#/i18n/declaration";
import { KtBreadcrumb } from "#/components/features/kt-video/kt-breadcrumb";
import { KtRefreshCadence } from "#/components/features/kt-video/kt-refresh-cadence";
import type { KnowledgeImportance } from "#/lib/knowledge/knowledge-engine";
import {
  resolveOrgId,
  findRepositoryUuid,
} from "#/lib/data-platform/repositories/repository-identity";
import { knowledgePersistenceRepository } from "#/lib/data-platform/repositories/knowledge-repository";
import {
  useConnectedRepositories,
  resolveCommitSha,
} from "#/lib/knowledge/connected-repositories";
import { generateKnowledge } from "#/lib/knowledge/generate-knowledge";

/** Parses the `"owner/repo@branch"` repositoryId shape produced by
 * kt-list.tsx's useConnectedRepositories/AddRepositoryTrigger. */
function parseRepositoryId(
  repositoryId: string,
): { owner: string; repo: string; branch: string } | null {
  const atIdx = repositoryId.lastIndexOf("@");
  if (atIdx === -1) return null;
  const branch = repositoryId.slice(atIdx + 1);
  const [owner, repo] = repositoryId.slice(0, atIdx).split("/");
  if (!owner || !repo || !branch) return null;
  return { owner, repo, branch };
}

/** Content-only fallback: checks Supabase for a previously-persisted
 * generation and seeds the store from it, so Docs renders real content
 * instead of "hasn't been generated yet" even with no live session. Used
 * only when no live conversation exists for this repo (see
 * `useKnowledgeRehydration` below) — a hydrated entry this way has
 * `conversationUrl`/`sessionApiKey: null` and `localPath: ""`, so Watch KT
 * and CodeGraph correctly ask for a live session rather than silently
 * failing. Best-effort: any failure (unconfigured, RLS, nothing found) just
 * leaves today's empty-state fallback in place. */
async function tryColdRehydration(
  repositoryId: string,
  parsed: { owner: string; repo: string; branch: string },
  hydrate: (
    repositoryId: string,
    snapshot: Parameters<
      ReturnType<typeof useKnowledgeStore.getState>["hydrate"]
    >[1],
    knowledge: Parameters<
      ReturnType<typeof useKnowledgeStore.getState>["hydrate"]
    >[2],
    qualityFlags: Parameters<
      ReturnType<typeof useKnowledgeStore.getState>["hydrate"]
    >[3],
  ) => void,
): Promise<boolean> {
  const orgId = await resolveOrgId();
  if (!orgId) return false;
  const repositoryUuid = await findRepositoryUuid(
    orgId,
    parsed.owner,
    parsed.repo,
  );
  if (!repositoryUuid) return false;
  const knowledge =
    await knowledgePersistenceRepository.getLatestGenerationForRepository(
      repositoryUuid,
    );
  if (!knowledge) return false;
  hydrate(
    repositoryId,
    {
      repositoryId,
      owner: parsed.owner,
      repo: parsed.repo,
      branch: parsed.branch,
      commitSha: knowledge.commitSha,
      localPath: "",
    },
    knowledge,
    [],
  );
  return true;
}

/**
 * On a cold page load (direct navigation, reload) the in-memory knowledge
 * store starts empty even for a repo generated in an earlier session. This
 * prefers a REAL, live entry whenever a conversation for this repo already
 * exists (found the same way kt-list.tsx finds connected repos) — resolving
 * its commit and calling `generateKnowledge`, which hits DeepWiki's own
 * cache for an already-generated commit (fast) and, critically, populates
 * real `conversationUrl`/`sessionApiKey`/`localPath`, so Watch KT and
 * CodeGraph work immediately rather than asking the user to "open a live
 * session" for a repo that already has one open. Only falls back to the
 * content-only Supabase stub when no live conversation exists at all.
 */
function useKnowledgeRehydration(repositoryId: string | undefined) {
  const hasEntry = useKnowledgeStore((s) =>
    repositoryId ? Boolean(s.byRepositoryId[repositoryId]) : true,
  );
  const hydrate = useKnowledgeStore((s) => s.hydrate);
  const startGenerating = useKnowledgeStore((s) => s.startGenerating);
  const setProgress = useKnowledgeStore((s) => s.setProgress);
  const setReady = useKnowledgeStore((s) => s.setReady);
  const setError = useKnowledgeStore((s) => s.setError);
  const connected = useConnectedRepositories();
  const { backend } = useActiveBackend();
  const [checked, setChecked] = useState(hasEntry);
  const attemptedRef = useRef<string | null>(null);

  const liveMatch = repositoryId
    ? connected.find((c) => c.repositoryId === repositoryId)
    : undefined;

  useEffect(() => {
    if (hasEntry || !repositoryId) {
      setChecked(true);
      return undefined;
    }
    const parsed = parseRepositoryId(repositoryId);
    if (!parsed) {
      setChecked(true);
      return undefined;
    }
    // Wait for the connected-repositories query to settle before deciding
    // there's no live conversation — `connected` starts empty on first
    // render regardless of whether one actually exists.
    if (!liveMatch && connected.length === 0) return undefined;
    if (attemptedRef.current === repositoryId) return undefined;
    attemptedRef.current = repositoryId;

    let cancelled = false;
    (async () => {
      if (liveMatch?.workingDir) {
        try {
          const commitSha = await resolveCommitSha(
            liveMatch.owner,
            liveMatch.repo,
            liveMatch.workingDir,
            liveMatch.conversationUrl,
            liveMatch.sessionApiKey,
          );
          if (cancelled) return;
          await generateKnowledge(
            {
              repositoryId,
              owner: liveMatch.owner,
              repo: liveMatch.repo,
              branch: liveMatch.branch,
              commitSha,
              localPath: liveMatch.workingDir,
            },
            liveMatch.conversationUrl,
            liveMatch.sessionApiKey,
            { startGenerating, setProgress, setReady, setError },
            () => {},
            {},
            backend.id,
          );
          return;
        } catch {
          // Fall through to the content-only Supabase stub below rather
          // than leaving the page stuck on a live-session attempt that
          // failed (e.g. the clone never finished).
        }
      }
      if (!cancelled) await tryColdRehydration(repositoryId, parsed, hydrate);
    })().finally(() => {
      if (!cancelled) setChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [
    repositoryId,
    hasEntry,
    hydrate,
    liveMatch,
    connected.length,
    backend.id,
    startGenerating,
    setProgress,
    setReady,
    setError,
  ]);

  return checked;
}

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
    return (
      <main className="min-h-full" data-testid="kt-repository">
        <div className="mx-auto max-w-4xl p-6">
          <KtBreadcrumb />
          {rehydrationChecked ? (
            <p className="text-sm text-[var(--oh-muted)]">
              {t(I18nKey.KT$NOT_FOUND)}
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

  const { knowledge } = state;
  const pagesById = new Map(knowledge.pages.map((page) => [page.id, page]));
  const sectioned = new Set(
    knowledge.sections.flatMap((section) => section.pageIds),
  );
  const unsectionedPages = knowledge.pages.filter(
    (page) => !sectioned.has(page.id),
  );

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
