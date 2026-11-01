import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { I18nKey } from "#/i18n/declaration";
import { BrandButton } from "#/components/features/settings/brand-button";

interface ModuleErrorPanelProps {
  kind: "not-found" | "crash";
  /** Technical detail shown behind "Details" (error message, status). */
  detail?: string;
}

/**
 * What a page shows when it crashed or does not exist. Rendered inside the
 * app shell (the sidebar keeps working), with a way forward: try again,
 * go back, or go to conversations. Details stay folded away so a user can
 * copy them into a bug report without reading a stack trace first.
 */
export function ModuleErrorPanel({ kind, detail }: ModuleErrorPanelProps) {
  const { t } = useTranslation("openhands");
  const navigate = useNavigate();
  const notFound = kind === "not-found";

  return (
    <div
      data-testid={notFound ? "module-not-found" : "module-error"}
      role={notFound ? undefined : "alert"}
      className="flex h-full min-h-[60vh] items-center justify-center p-6"
    >
      <div className="flex max-w-md flex-col gap-4 rounded-xl border border-[var(--oh-border)] bg-base-secondary p-6">
        <h1 className="text-lg font-semibold">
          {t(
            notFound
              ? I18nKey.MODULE$NOT_FOUND_TITLE
              : I18nKey.MODULE$ERROR_TITLE,
          )}
        </h1>
        <p className="text-sm text-[var(--oh-muted)]">
          {t(
            notFound
              ? I18nKey.MODULE$NOT_FOUND_BODY
              : I18nKey.MODULE$ERROR_BODY,
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {!notFound && (
            <BrandButton
              type="button"
              variant="primary"
              testId="module-error-retry"
              onClick={() => window.location.reload()}
            >
              {t(I18nKey.MODULE$TRY_AGAIN)}
            </BrandButton>
          )}
          <BrandButton
            type="button"
            variant={notFound ? "primary" : "secondary"}
            testId="module-error-home"
            onClick={() => navigate("/conversations")}
          >
            {t(I18nKey.MODULE$GO_TO_CONVERSATIONS)}
          </BrandButton>
          <BrandButton
            type="button"
            variant="secondary"
            testId="module-error-back"
            onClick={() => navigate(-1)}
          >
            {t(I18nKey.MODULE$GO_BACK)}
          </BrandButton>
        </div>
        {detail && (
          <details className="text-xs text-[var(--oh-muted)]">
            <summary className="cursor-pointer">
              {t(I18nKey.MODULE$DETAILS)}
            </summary>
            <pre className="mt-2 whitespace-pre-wrap break-words">{detail}</pre>
          </details>
        )}
      </div>
    </div>
  );
}
