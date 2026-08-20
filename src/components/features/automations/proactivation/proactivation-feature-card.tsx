import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type { Automation } from "#/types/automation";
import {
  useToggleAutomation,
  useDispatchAutomation,
} from "#/hooks/query/use-automations";
import { useAutomationRunSummaries } from "#/hooks/query/use-automation-run-summaries";
import { useNavigation } from "#/context/navigation-context";
import { automationDetailPath } from "#/manifests/automation-interface";
import { BrandButton } from "#/components/features/settings/brand-button";
import { parseCronSchedule } from "#/utils/automation-schedule";
import {
  getWatchAreaLabel,
  isProactivationAutomation,
  parseProactivationMarker,
} from "#/utils/proactivation-prompt";
import {
  displaySuccessToast,
  displayErrorToast,
} from "#/utils/custom-toast-handlers";
import { getApiErrorMessage } from "#/utils/api-error-message";
import { ProactivationSetupWizard } from "./proactivation-setup-wizard";

interface ProactivationFeatureCardProps {
  automations: Automation[];
}

const AUTONOMY_LABEL_KEYS: Record<string, I18nKey> = {
  recommend: I18nKey.AUTOMATIONS$PROACTIVATION_AUTONOMY_RECOMMEND_LABEL,
  "prepare-fix": I18nKey.AUTOMATIONS$PROACTIVATION_AUTONOMY_PREPARE_FIX_LABEL,
  "create-pr": I18nKey.AUTOMATIONS$PROACTIVATION_AUTONOMY_CREATE_PR_LABEL,
};

const SCHEDULE_LABEL_KEYS: Record<string, I18nKey> = {
  daily: I18nKey.AUTOMATIONS$FREQUENCY_DAILY,
  weekdays: I18nKey.AUTOMATIONS$FREQUENCY_WEEKDAYS,
  weekly: I18nKey.AUTOMATIONS$FREQUENCY_WEEKLY,
};

function scheduleLabel(
  automation: Automation,
  t: (key: I18nKey) => string,
): string | null {
  const parsed = parseCronSchedule(automation.trigger.schedule);
  const key = SCHEDULE_LABEL_KEYS[parsed.kind];
  return key ? t(key) : null;
}

export function ProactivationFeatureCard({
  automations,
}: ProactivationFeatureCardProps) {
  const { t } = useTranslation("openhands");
  const { navigate } = useNavigation();
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const toggleMutation = useToggleAutomation();
  const dispatchMutation = useDispatchAutomation();

  const proactivationAutomations = useMemo(
    () => automations.filter((a) => isProactivationAutomation(a.prompt)),
    [automations],
  );
  const runSummaries = useAutomationRunSummaries(proactivationAutomations, {
    enabled: proactivationAutomations.length > 0,
  });

  const isEnabled = proactivationAutomations.length > 0;
  const anyActive = proactivationAutomations.some((a) => a.enabled);

  const firstMarker = isEnabled
    ? parseProactivationMarker(proactivationAutomations[0].prompt)
    : null;

  const lastRunAt = useMemo(() => {
    let latest: string | null = null;
    proactivationAutomations.forEach((automation) => {
      const summary = runSummaries.get(automation.id)?.summary;
      const startedAt = summary?.latestRun?.started_at;
      if (startedAt && (!latest || startedAt > latest)) latest = startedAt;
    });
    return latest;
  }, [proactivationAutomations, runSummaries]);

  const handleRunAll = () => {
    proactivationAutomations
      .filter((a) => a.enabled)
      .forEach((automation) => {
        dispatchMutation.mutate(automation.id, {
          onError: (error) => {
            displayErrorToast(
              getApiErrorMessage(error, t(I18nKey.AUTOMATIONS$RUN_NOW_ERROR)),
            );
          },
        });
      });
    if (proactivationAutomations.some((a) => a.enabled)) {
      displaySuccessToast(t(I18nKey.AUTOMATIONS$RUN_NOW_SUCCESS));
    }
  };

  const handlePauseResume = () => {
    const willEnable = !anyActive;
    proactivationAutomations.forEach((automation) => {
      toggleMutation.mutate({ id: automation.id, enabled: willEnable });
    });
  };

  const handleViewRuns = () => {
    if (proactivationAutomations[0]) {
      navigate?.(automationDetailPath(proactivationAutomations[0].id));
    }
  };

  if (!isEnabled) {
    return (
      <>
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-[var(--oh-primary,theme(colors.blue.500))]/40 bg-gradient-to-br from-[var(--oh-surface-raised)] to-[var(--oh-surface)] p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-[var(--oh-primary,theme(colors.blue.400))]" />
            <h2 className="text-base font-semibold text-content">
              {t(I18nKey.AUTOMATIONS$PROACTIVATION_TITLE)}
            </h2>
          </div>
          <p className="text-sm text-muted">
            {t(I18nKey.AUTOMATIONS$PROACTIVATION_DESCRIPTION)}
          </p>
          <p className="text-xs text-muted">
            {t(I18nKey.AUTOMATIONS$PROACTIVATION_CATEGORIES)}
          </p>
          <div>
            <BrandButton
              type="button"
              variant="primary"
              testId="proactivation-enable"
              onClick={() => setIsWizardOpen(true)}
            >
              {t(I18nKey.AUTOMATIONS$PROACTIVATION_ENABLE)}
            </BrandButton>
          </div>
        </div>

        <ProactivationSetupWizard
          isOpen={isWizardOpen}
          onClose={() => setIsWizardOpen(false)}
          onEnabled={() => setIsWizardOpen(false)}
        />
      </>
    );
  }

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-raised)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-[var(--oh-primary,theme(colors.blue.400))]" />
          <h2 className="text-base font-semibold text-content">
            {t(I18nKey.AUTOMATIONS$PROACTIVATION_TITLE)}
          </h2>
          <span
            className="rounded-full bg-[var(--oh-surface)] px-2 py-0.5 text-[11px] font-medium text-muted"
            data-testid="proactivation-status"
          >
            {anyActive
              ? t(I18nKey.AUTOMATIONS$PROACTIVATION_ACTIVE)
              : t(I18nKey.AUTOMATIONS$PROACTIVATION_PAUSED)}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
        <span>
          {t(I18nKey.AUTOMATIONS$PROACTIVATION_REPOSITORIES_COUNT, {
            count: proactivationAutomations.length,
          })}
        </span>
        {firstMarker && (
          <span>
            {t(I18nKey.AUTOMATIONS$PROACTIVATION_MODE_LABEL)}:{" "}
            {t(AUTONOMY_LABEL_KEYS[firstMarker.autonomyLevel])}
          </span>
        )}
        {firstMarker && (
          <span>
            {t(I18nKey.AUTOMATIONS$PROACTIVATION_SUMMARY_WATCHING)}:{" "}
            {firstMarker.watchAreas.map((a) => getWatchAreaLabel(a)).join(", ")}
          </span>
        )}
        <span>
          {t(I18nKey.AUTOMATIONS$PROACTIVATION_LAST_RUN)}:{" "}
          {lastRunAt
            ? new Date(lastRunAt).toLocaleString()
            : t(I18nKey.AUTOMATIONS$PROACTIVATION_NEVER_RUN)}
        </span>
        {scheduleLabel(proactivationAutomations[0], t) && (
          <span>{scheduleLabel(proactivationAutomations[0], t)}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <BrandButton type="button" variant="secondary" onClick={handleViewRuns}>
          {t(I18nKey.AUTOMATIONS$PROACTIVATION_VIEW_RUNS)}
        </BrandButton>
        <BrandButton
          type="button"
          variant="secondary"
          onClick={handleRunAll}
          isDisabled={dispatchMutation.isPending}
        >
          {t(I18nKey.AUTOMATIONS$RUN_NOW)}
        </BrandButton>
        <BrandButton
          type="button"
          variant="secondary"
          onClick={handlePauseResume}
        >
          {anyActive
            ? t(I18nKey.AUTOMATIONS$PROACTIVATION_PAUSE)
            : t(I18nKey.AUTOMATIONS$PROACTIVATION_RESUME)}
        </BrandButton>
      </div>
    </div>
  );
}
