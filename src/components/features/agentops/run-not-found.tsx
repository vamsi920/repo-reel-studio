import { Link } from "react-router";
import { ArrowLeft, SearchX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";

interface RunNotFoundProps {
  runId: string;
}

/**
 * The collector answered, but has no record of this run — the id was
 * mistyped, the run expired, or it was recorded before the collector last
 * restarted. Distinct from {@link CollectorUnavailable}: the companion
 * process is fine, so there is nothing to start.
 */
export function RunNotFound({ runId }: RunNotFoundProps) {
  const { t } = useTranslation("openhands");

  return (
    <div
      data-testid="agentops-run-not-found"
      className="mx-auto flex max-w-2xl flex-col items-center gap-4 rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--background-primary)] p-8 text-center"
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-[var(--background-secondary)] text-[var(--text-tertiary)]">
        <SearchX size={22} />
      </div>
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">
        {t(I18nKey.AGENTOPS$RUN_NOT_FOUND_TITLE)}
      </h2>
      <p className="max-w-md text-sm text-[var(--text-secondary)]">
        {t(I18nKey.AGENTOPS$RUN_NOT_FOUND_BODY)}
      </p>
      <code className="max-w-md break-all font-mono text-xs text-[var(--text-tertiary)]">
        {runId}
      </code>
      <Link
        to="/agentops/live"
        className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-color)] px-3 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--background-secondary)]"
      >
        <ArrowLeft size={14} />
        {t(I18nKey.AGENTOPS$RUN_BACK)}
      </Link>
    </div>
  );
}
