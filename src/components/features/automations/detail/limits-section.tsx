import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Gauge } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { BrandButton } from "#/components/features/settings/brand-button";
import { ToggleSwitch } from "#/components/features/automations/toggle-switch";
import {
  useAutomationPolicies,
  useSaveAutomationPolicy,
} from "#/hooks/query/use-automation-policies";
import { useAutomationRuns } from "#/hooks/query/use-automation-detail";
import { windowSpend } from "#/utils/automation-guard-policy";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import type { AutomationPolicy } from "#/api/automation-policy-service";
import { SectionCard } from "./section-card";

/** Runs read to total the last 24 h; the guard reads the same page size. */
const SPEND_WINDOW_RUNS = 50;

function formatUsd(amount: number) {
  return `$${amount.toFixed(2)}`;
}

function toInput(value: number | null | undefined) {
  return value == null ? "" : String(value);
}

interface LimitsSectionProps {
  automationId: string;
}

/**
 * Per-automation spend and rate limits, enforced by the local automation
 * guard (scripts/automation-guard.mjs) whether or not the app is open.
 * Benchmarked against Devin, which offers both; without them a noisy trigger
 * could start runs without bound.
 */
export function LimitsSection({ automationId }: LimitsSectionProps) {
  const { t, i18n } = useTranslation("openhands");
  const { data } = useAutomationPolicies();
  const { data: runsData, dataUpdatedAt } = useAutomationRuns({
    id: automationId,
    limit: SPEND_WINDOW_RUNS,
  });
  const saveMutation = useSaveAutomationPolicy();

  const policy = data?.policies.automations?.[automationId] ?? undefined;
  const paused = data?.guard.paused?.[automationId] ?? null;

  const [budget, setBudget] = useState("");
  const [perHour, setPerHour] = useState("");
  const [oneAtATime, setOneAtATime] = useState(false);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [perHourError, setPerHourError] = useState<string | null>(null);

  // Load the saved policy once it arrives; later background refetches must
  // not overwrite what the user is typing.
  const loaded = data !== undefined;
  useEffect(() => {
    if (!loaded) return;
    setBudget(toInput(policy?.daily_budget_usd));
    setPerHour(toInput(policy?.max_runs_per_hour));
    setOneAtATime(!!policy?.skip_overlapping_runs);
  }, [loaded, automationId]);

  // As of when the runs were fetched, which keeps render pure.
  const spent = useMemo(
    () => windowSpend(runsData?.runs ?? [], {}, dataUpdatedAt).spent,
    [runsData, dataUpdatedAt],
  );

  const handleSave = () => {
    const budgetValue = budget.trim() === "" ? null : Number(budget);
    const perHourValue = perHour.trim() === "" ? null : Number(perHour);
    const budgetInvalid =
      budgetValue !== null &&
      !(Number.isFinite(budgetValue) && budgetValue > 0);
    const perHourInvalid =
      perHourValue !== null &&
      !(Number.isInteger(perHourValue) && perHourValue >= 1);
    setBudgetError(
      budgetInvalid ? t(I18nKey.AUTOMATIONS$LIMITS$INVALID_BUDGET) : null,
    );
    setPerHourError(
      perHourInvalid ? t(I18nKey.AUTOMATIONS$LIMITS$INVALID_RATE) : null,
    );
    if (budgetInvalid || perHourInvalid) return;

    const next: AutomationPolicy = {
      daily_budget_usd: budgetValue,
      max_runs_per_hour: perHourValue,
      skip_overlapping_runs: oneAtATime,
    };
    saveMutation.mutate(
      { id: automationId, policy: next },
      {
        onSuccess: () =>
          displaySuccessToast(t(I18nKey.AUTOMATIONS$LIMITS$SAVED)),
        onError: () =>
          displayErrorToast(t(I18nKey.AUTOMATIONS$LIMITS$SAVE_FAILED)),
      },
    );
  };

  return (
    <SectionCard
      icon={<Gauge className="size-4" />}
      title={t(I18nKey.AUTOMATIONS$LIMITS$TITLE)}
    >
      <div className="flex flex-col gap-4" data-testid="automation-limits">
        <p className="text-sm text-muted">
          {t(I18nKey.AUTOMATIONS$LIMITS$DESCRIPTION)}
        </p>

        {paused && (
          <div
            role="status"
            data-testid="automation-limits-paused"
            className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-content"
          >
            {t(I18nKey.AUTOMATIONS$LIMITS$PAUSED, {
              spent: formatUsd(paused.spent_usd ?? 0),
              budget: formatUsd(paused.budget_usd ?? 0),
            })}{" "}
            {paused.until &&
              t(I18nKey.AUTOMATIONS$LIMITS$PAUSED_UNTIL, {
                time: new Date(paused.until).toLocaleString(i18n.language),
              })}
          </div>
        )}

        <p className="text-xs text-muted" data-testid="automation-limits-spent">
          {t(I18nKey.AUTOMATIONS$LIMITS$SPENT, { amount: formatUsd(spent) })}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <SettingsInput
              testId="automation-limits-budget"
              name="daily_budget_usd"
              type="number"
              label={t(I18nKey.AUTOMATIONS$LIMITS$BUDGET_LABEL)}
              value={budget}
              onChange={setBudget}
              error={budgetError ?? undefined}
              showOptionalTag
              min={0}
              step={0.5}
            />
            <p className="text-xs text-muted">
              {t(I18nKey.AUTOMATIONS$LIMITS$BUDGET_HINT)}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <SettingsInput
              testId="automation-limits-per-hour"
              name="max_runs_per_hour"
              type="number"
              label={t(I18nKey.AUTOMATIONS$LIMITS$RATE_LABEL)}
              value={perHour}
              onChange={setPerHour}
              error={perHourError ?? undefined}
              showOptionalTag
              min={1}
              step={1}
            />
            <p className="text-xs text-muted">
              {t(I18nKey.AUTOMATIONS$LIMITS$RATE_HINT)}
            </p>
          </div>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-content">
              {t(I18nKey.AUTOMATIONS$LIMITS$OVERLAP_LABEL)}
            </span>
            <span className="text-xs text-muted">
              {t(I18nKey.AUTOMATIONS$LIMITS$OVERLAP_HINT)}
            </span>
          </div>
          <ToggleSwitch
            enabled={oneAtATime}
            label={t(I18nKey.AUTOMATIONS$LIMITS$OVERLAP_LABEL)}
            onToggle={() => setOneAtATime((value) => !value)}
          />
        </div>

        <div className="flex justify-end">
          <BrandButton
            testId="automation-limits-save"
            type="button"
            variant="primary"
            onClick={handleSave}
            isDisabled={saveMutation.isPending}
          >
            {t(I18nKey.BUTTON$SAVE)}
          </BrandButton>
        </div>
      </div>
    </SectionCard>
  );
}
