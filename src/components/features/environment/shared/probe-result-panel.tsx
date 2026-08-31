import { useTranslation } from "react-i18next";
import { CheckCircle2, XCircle, Clock } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import type { ProbeResult } from "#/lib/environment/types/probe";
import { MAX_TOLERABLE_CLOCK_SKEW_MS } from "#/lib/environment/types/probe";
import { VANTAGE_LABEL_KEY } from "#/lib/environment/display";

export interface ProbeResultPanelProps {
  result: ProbeResult;
  className?: string;
  testId?: string;
}

/**
 * Renders one probe. Shared by the Connections tab and by the chat tool
 * visualiser, so a result the agent produced looks identical to one the user
 * triggered by hand -- there is no "agent view" of the truth.
 */
export function ProbeResultPanel({
  result,
  className,
  testId = "probe-result",
}: ProbeResultPanelProps) {
  const { t } = useTranslation("openhands");
  const skewProblem =
    result.clockSkewMs !== undefined &&
    Math.abs(result.clockSkewMs) > MAX_TOLERABLE_CLOCK_SKEW_MS;

  return (
    <div
      data-testid={testId}
      data-ok={result.ok}
      className={cn(
        "flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--background-secondary)] p-3",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span
          className={cn(
            "ame-badge",
            result.ok ? "ame-badge-success" : "ame-badge-danger",
          )}
        >
          {t(
            result.ok
              ? I18nKey.ENVIRONMENT$STATUS_OK
              : I18nKey.ENVIRONMENT$STATUS_ERROR,
          )}
        </span>
        {/* The vantage is never omitted: a result from the platform's network
            says nothing about the customer's, and conflating the two is the
            classic way installer tooling reports a confident falsehood. */}
        <span className="ame-badge ame-badge-neutral">
          {t(VANTAGE_LABEL_KEY[result.vantage])}
        </span>
        <span className="inline-flex items-center gap-1 text-[var(--text-tertiary)]">
          <Clock size={12} aria-hidden />
          {`${result.latencyMs}ms`}
        </span>
        {result.serverVersion ? (
          <span className="text-[var(--text-tertiary)]">
            {result.serverVersion}
          </span>
        ) : null}
      </div>

      <ul className="flex flex-col gap-1.5">
        {result.checks.map((check) => (
          <li key={check.id} className="flex items-start gap-2 text-xs">
            {check.ok ? (
              <CheckCircle2
                size={14}
                aria-hidden
                className="mt-0.5 shrink-0 text-[var(--success-500)]"
              />
            ) : (
              <XCircle
                size={14}
                aria-hidden
                className="mt-0.5 shrink-0 text-[var(--error-500)]"
              />
            )}
            <span className="text-[var(--text-primary)]">
              {t(check.labelKey)}
            </span>
            {check.detail ? (
              <span className="text-[var(--text-tertiary)]">
                {check.detail}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {result.missingScopes && result.missingScopes.length > 0 ? (
        <div className="flex flex-col gap-1 text-xs">
          <span className="text-[var(--warning-500)]">
            {t(I18nKey.ENVIRONMENT$SCOPE_DOWNGRADE)}
          </span>
          <span className="text-[var(--text-tertiary)]">
            {`${t(I18nKey.ENVIRONMENT$SCOPES_MISSING)}: ${result.missingScopes.join(", ")}`}
          </span>
        </div>
      ) : null}

      {skewProblem ? (
        <p className="text-xs text-[var(--warning-500)]">
          {`${t(I18nKey.ENVIRONMENT$STATUS_ERROR)} · ${Math.round((result.clockSkewMs ?? 0) / 1000)}s`}
        </p>
      ) : null}

      {result.remediation ? (
        <div className="flex flex-col gap-1 border-t border-[var(--border-color)] pt-2">
          <span className="ame-eyebrow">
            {t(I18nKey.ENVIRONMENT$REMEDIATION_TITLE)}
          </span>
          <p className="text-xs text-[var(--text-secondary)]">
            {t(result.remediation.codeKey)}
          </p>
          {result.remediation.steps.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {result.remediation.steps.map((step) => (
                <li
                  key={`${step.kind}:${step.targetKey}`}
                  className="text-xs text-[var(--text-tertiary)]"
                >
                  {step.value ? (
                    <code className="rounded bg-[var(--background-tertiary)] px-1 py-0.5">
                      {step.value}
                    </code>
                  ) : (
                    t(step.targetKey)
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
