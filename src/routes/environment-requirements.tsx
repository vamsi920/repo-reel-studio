import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { FEATURE_REQUIREMENTS } from "#/lib/environment/requirements/feature-requirements";
import { useEnvironmentProfile } from "#/hooks/query/use-environment-profile";
import { useEnvironmentReadiness } from "#/hooks/query/use-environment-readiness";
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

  // Every item, grouped by feature, so someone reading this sees "Jira
  // triggers need these four things" rather than a flat list of hostnames.
  const byFeature = React.useMemo(() => {
    const all = [
      ...readiness.blocking,
      ...readiness.degrading,
      ...readiness.unknown,
    ];
    const satisfied = new Set(all.map((item) => item.id));
    const grouped = new Map<string, typeof all>();
    for (const item of all) {
      const bucket = grouped.get(item.featureId) ?? [];
      bucket.push(item);
      grouped.set(item.featureId, bucket);
    }
    return { grouped, unsatisfiedIds: satisfied };
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
        const problems = byFeature.grouped.get(feature.featureId) ?? [];
        return (
          <section
            key={feature.featureId}
            data-testid={`requirement-feature-${feature.featureId}`}
            className="ame-card flex flex-col gap-3 p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                {t(feature.nameKey)}
              </h2>
              <span
                className={cn(
                  "ame-badge",
                  problems.some(
                    (item) =>
                      item.severity === "blocking" &&
                      item.status === "unsatisfied",
                  )
                    ? "ame-badge-danger"
                    : problems.some((item) => item.status === "unsatisfied")
                      ? "ame-badge-warning"
                      : "ame-badge-success",
                )}
              >
                {t(
                  problems.some(
                    (item) =>
                      item.severity === "blocking" &&
                      item.status === "unsatisfied",
                  )
                    ? I18nKey.ENVIRONMENT$STATUS_ERROR
                    : problems.some((item) => item.status === "unsatisfied")
                      ? I18nKey.ENVIRONMENT$STATUS_DEGRADED
                      : I18nKey.ENVIRONMENT$STATUS_OK,
                )}
              </span>
            </div>

            <ul className="flex flex-col divide-y divide-[var(--border-color)]">
              {feature.requires.map((entry) => {
                const item = problems.find(
                  (candidate) =>
                    labelFor(candidate.node) === labelFor(entry.node) &&
                    candidate.severity === entry.severity,
                );
                const status = item?.status ?? "satisfied";
                const scope = requirementScopeHint(entry.node);
                return (
                  <li
                    key={`${feature.featureId}:${labelFor(entry.node)}`}
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
