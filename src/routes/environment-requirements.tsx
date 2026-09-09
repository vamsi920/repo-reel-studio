import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import {
  FEATURE_REQUIREMENTS,
  requirementNodeId,
} from "#/lib/environment/requirements/feature-requirements";
import { useEnvironmentProfile } from "#/hooks/query/use-environment-profile";
import { useEnvironmentReadiness } from "#/hooks/query/use-environment-readiness";
import type { RequirementStatus } from "#/lib/environment/types/requirements";
import {
  SEVERITY_LABEL_KEY,
  pipClassForRequirementStatus,
} from "#/lib/environment/display";
import {
  useRequirementLabel,
  requirementScopeHint,
} from "#/components/features/environment/shared/requirement-label";
import { useOnboardingCopilotStore } from "#/stores/onboarding-copilot-store";

function EnvironmentRequirementsScreen() {
  const { t } = useTranslation("openhands");
  const { data: profile } = useEnvironmentProfile();
  const readiness = useEnvironmentReadiness(profile ?? null);
  const labelFor = useRequirementLabel();
  const openCopilot = useOnboardingCopilotStore((state) => state.openWithSeed);

  // Status by requirement id, so a row asks the report about exactly the node
  // it is drawing. Reading the blocking/degrading/unknown buckets instead
  // silently reported everything they leave out -- satisfied, not-applicable
  // and unsatisfied-but-optional requirements alike -- as satisfied.
  const statusById = React.useMemo(() => {
    const map = new Map<string, RequirementStatus>();
    for (const item of readiness.items) map.set(item.id, item.status);
    return map;
  }, [readiness]);

  return (
    <div
      data-testid="environment-requirements"
      className="flex flex-col gap-5 pb-6"
    >
      <p className="text-sm text-[var(--text-secondary)]">
        {t(I18nKey.ENVIRONMENT$REQUIREMENTS_SUBTITLE)}
      </p>

      {FEATURE_REQUIREMENTS.map((feature) => {
        const rows = feature.requires.map((entry) => ({
          entry,
          nodeId: requirementNodeId(entry.node),
          // A requirement the report never evaluated has not been checked --
          // it is not passing.
          status:
            statusById.get(
              `${feature.featureId}:${requirementNodeId(entry.node)}`,
            ) ?? ("unknown" as RequirementStatus),
        }));
        const hasBlockingFailure = rows.some(
          (row) =>
            row.status === "unsatisfied" && row.entry.severity === "blocking",
        );
        const hasFailure = rows.some((row) => row.status === "unsatisfied");
        // Nothing proved either way is its own state. Painting it green told
        // people a deployment was ready when no probe had run at all.
        const hasUnknown = rows.some((row) => row.status === "unknown");
        const featureBadge = hasBlockingFailure
          ? {
              className: "ame-badge-danger",
              key: I18nKey.ENVIRONMENT$STATUS_ERROR,
            }
          : hasFailure
            ? {
                className: "ame-badge-warning",
                key: I18nKey.ENVIRONMENT$STATUS_DEGRADED,
              }
            : hasUnknown
              ? {
                  className: "ame-badge-neutral",
                  key: I18nKey.ENVIRONMENT$STATUS_UNKNOWN,
                }
              : {
                  className: "ame-badge-success",
                  key: I18nKey.ENVIRONMENT$STATUS_OK,
                };
        return (
          <section
            key={feature.featureId}
            data-testid={`requirement-feature-${feature.featureId}`}
            data-status={
              hasBlockingFailure
                ? "blocked"
                : hasFailure
                  ? "degraded"
                  : hasUnknown
                    ? "unknown"
                    : "ready"
            }
            className="ame-card flex flex-col gap-3 p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                {t(feature.nameKey)}
              </h2>
              <span className={cn("ame-badge", featureBadge.className)}>
                {t(featureBadge.key)}
              </span>
            </div>

            <ul className="flex flex-col divide-y divide-[var(--border-color)]">
              {rows.map(({ entry, nodeId, status }) => {
                const scope = requirementScopeHint(entry.node);
                return (
                  <li
                    key={`${feature.featureId}:${nodeId}:${entry.severity}`}
                    data-testid={`requirement-row-${feature.featureId}`}
                    data-status={status}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden
                        className={cn(pipClassForRequirementStatus(status))}
                      />
                      <span className="truncate text-sm text-[var(--text-primary)]">
                        {labelFor(entry.node)}
                      </span>
                      {scope ? (
                        <span className="text-xs text-[var(--text-tertiary)]">
                          {scope}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {t(SEVERITY_LABEL_KEY[entry.severity])}
                      </span>
                      {status === "unsatisfied" ? (
                        <button
                          type="button"
                          data-testid={`requirement-fix-${feature.featureId}`}
                          onClick={() =>
                            openCopilot(
                              `${t(I18nKey.ENVIRONMENT$COPILOT_SEED_FIX)}: ${t(feature.nameKey)} — ${labelFor(entry.node)}`,
                            )
                          }
                          className="ame-btn-ghost ame-btn-xs"
                        >
                          {t(I18nKey.ENVIRONMENT$FIX_WITH_AGENT)}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>

            {feature.requires.some((entry) => entry.degradesToKey) ? (
              <p className="text-xs text-[var(--text-tertiary)]">
                {t(
                  feature.requires.find((entry) => entry.degradesToKey)
                    ?.degradesToKey as string,
                )}
              </p>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

export default EnvironmentRequirementsScreen;
