import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigation } from "#/context/navigation-context";
import { I18nKey } from "#/i18n/declaration";

/** Persistent breadcrumb for the Knowledge section — every depth (the
 * project grid, a repository's page list, a single page) always has a
 * one-click way back to the full workspace list, not just one level up. */
export function KtBreadcrumb({
  repositoryLabel,
  repositoryId,
  pageTitle,
}: {
  repositoryLabel?: string;
  repositoryId?: string;
  pageTitle?: string;
}) {
  const { navigate } = useNavigation();
  const { t } = useTranslation("openhands");

  return (
    <nav className="mb-4 flex min-w-0 items-center gap-1.5 text-sm text-[var(--oh-muted)]">
      <button
        type="button"
        onClick={() => navigate?.("/kt")}
        className="shrink-0 hover:text-[var(--oh-foreground)]"
      >
        {t(I18nKey.KT$TITLE)}
      </button>
      {repositoryLabel && (
        <>
          <ChevronRight className="size-3.5 shrink-0" aria-hidden />
          {pageTitle ? (
            <button
              type="button"
              onClick={() =>
                navigate?.(`/kt/${encodeURIComponent(repositoryId ?? "")}`)
              }
              className="min-w-0 truncate hover:text-[var(--oh-foreground)]"
            >
              {repositoryLabel}
            </button>
          ) : (
            <span className="min-w-0 truncate text-[var(--oh-foreground)]">
              {repositoryLabel}
            </span>
          )}
        </>
      )}
      {pageTitle && (
        <>
          <ChevronRight className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 truncate text-[var(--oh-foreground)]">
            {pageTitle}
          </span>
        </>
      )}
    </nav>
  );
}
