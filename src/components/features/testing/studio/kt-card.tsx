import React from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, Loader2, RefreshCw } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import type { TestProject } from "#/stores/test-studio-store";
import { useKnowledgeStore } from "#/stores/knowledge-store";
import { knowledgeRepositoryId, type TestRuntime } from "#/lib/testing/kt";
import {
  startKtGeneration,
  syncProjectKt,
  type PostResultFn,
} from "#/services/test-control";
import type { RunInWorkspace } from "#/lib/modernization/replay-harness";
import { NavigationLink } from "#/components/shared/navigation-link";

/**
 * Neo's Knowledge (KT) docs for this project: whether Neo already generated
 * them, whether they are in the workspace for the agent, and a way to
 * generate them from the studio when none exist.
 */
export function KtCard({
  project,
  runtime,
  runInWorkspace,
  postResult,
}: {
  project: TestProject;
  runtime?: TestRuntime;
  runInWorkspace?: RunInWorkspace;
  postResult: PostResultFn;
}) {
  const { t } = useTranslation("openhands");
  const repositoryId = knowledgeRepositoryId(project.source);
  const generation = useKnowledgeStore((s) => s.byRepositoryId[repositoryId]);
  const [busy, setBusy] = React.useState(false);
  const { kt } = project;
  const canGenerate = Boolean(
    runtime?.conversationUrl && runInWorkspace && kt.status !== "generating",
  );
  const progress =
    generation?.status === "generating"
      ? (generation.progress?.status ?? "")
      : "";

  const generate = async () => {
    if (!runtime || !runInWorkspace) return;
    setBusy(true);
    try {
      await startKtGeneration(project.id, runtime, runInWorkspace, postResult);
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setBusy(true);
    try {
      await syncProjectKt(project.id, runtime);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      data-testid="testing-kt"
      data-status={kt.status}
      className="ame-card flex flex-col gap-2 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="ame-eyebrow flex items-center gap-1">
          <BookOpen size={12} aria-hidden /> {t(I18nKey.TESTING$KT_TITLE)}
        </span>
        <span
          className={cn(
            "ame-badge",
            kt.status === "available" && "ame-badge-success",
            kt.status === "generating" && "ame-badge-primary",
            kt.status === "error" && "ame-badge-danger",
            (kt.status === "none" || kt.status === "unknown") &&
              "ame-badge-neutral",
          )}
        >
          {kt.status === "available"
            ? t(I18nKey.TESTING$KT_STATUS_AVAILABLE)
            : kt.status === "generating"
              ? t(I18nKey.TESTING$KT_STATUS_GENERATING)
              : kt.status === "error"
                ? t(I18nKey.TESTING$KT_STATUS_ERROR)
                : t(I18nKey.TESTING$KT_STATUS_NONE)}
        </span>
      </div>
      {kt.status === "available" ? (
        <div className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
          <span>
            {t(I18nKey.TESTING$KT_SUMMARY, {
              pages: kt.pages?.length ?? 0,
              commit: kt.commitSha?.slice(0, 8) ?? "",
            })}
          </span>
          <span className="text-[var(--text-tertiary)]">
            {kt.exportedCommit
              ? t(I18nKey.TESTING$KT_EXPORTED)
              : t(I18nKey.TESTING$KT_NOT_EXPORTED)}
          </span>
          {kt.pages?.length ? (
            <ul className="flex flex-wrap gap-1">
              {kt.pages.slice(0, 8).map((p) => (
                <li key={p.id} className="ame-badge ame-badge-neutral">
                  {p.title}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : kt.status === "generating" ? (
        <p className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <Loader2 size={12} className="animate-spin" aria-hidden />
          {t(I18nKey.TESTING$KT_GENERATING_HINT)}
          {progress ? (
            <span className="font-mono text-[var(--text-tertiary)]">
              {progress}
            </span>
          ) : null}
        </p>
      ) : (
        <p className="text-xs text-[var(--text-secondary)]">
          {kt.status === "error" && kt.error
            ? kt.error
            : t(I18nKey.TESTING$KT_NONE_HINT)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {kt.status !== "available" && kt.status !== "generating" ? (
          <button
            type="button"
            data-testid="testing-kt-generate"
            disabled={!canGenerate || busy}
            onClick={() => void generate()}
            className="ame-btn-primary ame-btn-xs"
          >
            {t(I18nKey.TESTING$KT_GENERATE)}
          </button>
        ) : null}
        <button
          type="button"
          data-testid="testing-kt-refresh"
          disabled={busy || kt.status === "generating"}
          aria-label={t(I18nKey.TESTING$KT_REFRESH)}
          title={t(I18nKey.TESTING$KT_REFRESH)}
          onClick={() => void refresh()}
          className="ame-btn-icon ame-btn-icon-sm"
        >
          <RefreshCw size={12} className={cn(busy && "animate-spin")} />
        </button>
        {project.source.kind === "repository" ? (
          <NavigationLink
            to={`/kt/${encodeURIComponent(repositoryId)}`}
            className="ame-btn-link ame-btn-xs"
          >
            {t(I18nKey.TESTING$KT_OPEN)}
          </NavigationLink>
        ) : null}
      </div>
    </section>
  );
}
