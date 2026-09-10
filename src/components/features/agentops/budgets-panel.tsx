import { useMemo, useState } from "react";
import { Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type {
  AgentOpsAutonomyLevel,
  AgentOpsBudget,
  AgentOpsPolicies,
  AgentOpsWorkspacePolicy,
} from "#/api/agentops-service/agentops-service.types";
import { useSaveAgentOpsPolicies } from "#/hooks/query/use-agentops";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { getApiErrorMessage } from "#/utils/api-error-message";
import { formatCostUsd, shortWorkspace } from "./agentops-formatting";

/**
 * Workspace budgets and autonomy.
 *
 * Used/Remaining come from cost the provider actually reported for runs in this
 * workspace this month. Projected is a straight-line extrapolation of that
 * spend and is labelled as such — it is not a forecast and not a bill.
 *
 * Autonomy is not decorative: `supervised` and `assisted` turn the runtime's
 * own confirmation mode on for this workspace's runs, which is what actually
 * blocks the agent before a risky action. `autonomous` leaves it off.
 */

const AUTONOMY_OPTIONS: {
  value: AgentOpsAutonomyLevel;
  labelKey: I18nKey;
  hintKey: I18nKey;
}[] = [
  {
    value: "supervised",
    labelKey: I18nKey.AGENTOPS$AUTONOMY_SUPERVISED,
    hintKey: I18nKey.AGENTOPS$AUTONOMY_SUPERVISED_HINT,
  },
  {
    value: "assisted",
    labelKey: I18nKey.AGENTOPS$AUTONOMY_ASSISTED,
    hintKey: I18nKey.AGENTOPS$AUTONOMY_ASSISTED_HINT,
  },
  {
    value: "autonomous",
    labelKey: I18nKey.AGENTOPS$AUTONOMY_AUTONOMOUS,
    hintKey: I18nKey.AGENTOPS$AUTONOMY_AUTONOMOUS_HINT,
  },
];

/**
 * Parse a budget field. Blank means "no limit" (`null`); anything that is not
 * a finite, non-negative number is `undefined` — invalid, never silently
 * treated as "no limit", because that would quietly lift a spending cap.
 */
export function parseBudgetUsd(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/** The editable subset of a workspace policy, as the form holds it. */
interface WorkspaceFormValues {
  monthlyBudgetUsd: string;
  runBudgetUsd: string;
  autonomyLevel: AgentOpsAutonomyLevel;
}

function toFormValues(policy: AgentOpsWorkspacePolicy): WorkspaceFormValues {
  return {
    monthlyBudgetUsd:
      typeof policy.monthlyBudgetUsd === "number"
        ? String(policy.monthlyBudgetUsd)
        : "",
    runBudgetUsd:
      typeof policy.runBudgetUsd === "number"
        ? String(policy.runBudgetUsd)
        : "",
    autonomyLevel: policy.autonomyLevel,
  };
}

function isDirty(
  edit: Partial<WorkspaceFormValues> | undefined,
  base: WorkspaceFormValues,
): boolean {
  if (!edit) return false;
  return (Object.keys(edit) as (keyof WorkspaceFormValues)[]).some(
    (field) => edit[field] !== base[field],
  );
}

const INPUT_CLASS =
  "w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--background-secondary)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]";

interface BudgetsPanelProps {
  budgets: AgentOpsBudget[];
  policies: AgentOpsPolicies;
}

export function BudgetsPanel({ budgets, policies }: BudgetsPanelProps) {
  const { t } = useTranslation("openhands");
  const { mutate: savePolicies, isPending } = useSaveAgentOpsPolicies();

  // The form is the server's copy plus whatever the operator has changed. Only
  // the changes are held in state, as an overlay: a refetch (every 30s, and
  // after any AgentOps mutation) refreshes the figures underneath without
  // wiping half-typed edits, and "dirty" means "differs from the server",
  // not "was touched".
  const [edits, setEdits] = useState<
    Record<string, Partial<WorkspaceFormValues>>
  >({});

  const baseline = useMemo(
    () =>
      Object.fromEntries(
        budgets.map((budget) => [
          budget.workspaceId,
          toFormValues(budget.policy),
        ]),
      ) as Record<string, WorkspaceFormValues>,
    [budgets],
  );

  const setField = <Field extends keyof WorkspaceFormValues>(
    workspaceId: string,
    field: Field,
    value: WorkspaceFormValues[Field],
  ) =>
    setEdits((current) => ({
      ...current,
      [workspaceId]: { ...(current[workspaceId] ?? {}), [field]: value },
    }));

  const dirtyWorkspaces = budgets.filter((budget) =>
    isDirty(edits[budget.workspaceId], baseline[budget.workspaceId]),
  );
  const hasInvalidAmount = dirtyWorkspaces.some((budget) => {
    const form = {
      ...baseline[budget.workspaceId],
      ...edits[budget.workspaceId],
    };
    return (
      parseBudgetUsd(form.monthlyBudgetUsd) === undefined ||
      parseBudgetUsd(form.runBudgetUsd) === undefined
    );
  });
  const canSave = dirtyWorkspaces.length > 0 && !hasInvalidAmount && !isPending;

  const save = () => {
    if (!canSave) return;
    // Only workspaces the operator changed are written; an untouched
    // workspace keeps whatever (possibly default) policy the collector holds.
    const workspaces = { ...policies.workspaces };
    for (const budget of dirtyWorkspaces) {
      const form = {
        ...baseline[budget.workspaceId],
        ...edits[budget.workspaceId],
      };
      workspaces[budget.workspaceId] = {
        ...(workspaces[budget.workspaceId] ?? {}),
        monthlyBudgetUsd: parseBudgetUsd(form.monthlyBudgetUsd) ?? null,
        runBudgetUsd: parseBudgetUsd(form.runBudgetUsd) ?? null,
        autonomyLevel: form.autonomyLevel,
      };
    }
    savePolicies(
      { ...policies, workspaces },
      {
        onSuccess: () => {
          // The hook has already written the saved policies into the budgets
          // cache, so dropping the overlay here does not flash the old values.
          setEdits({});
          displaySuccessToast(t(I18nKey.AGENTOPS$BUDGET_SAVED));
        },
        onError: (error) =>
          displayErrorToast(
            getApiErrorMessage(error, t(I18nKey.AGENTOPS$BUDGET_SAVE_FAILED)),
          ),
      },
    );
  };

  if (!budgets.length) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-color)] p-8 text-center text-sm text-[var(--text-secondary)]">
        {t(I18nKey.AGENTOPS$EMPTY_NO_BUDGETS)}
      </div>
    );
  }

  return (
    <div data-testid="agentops-budgets-panel" className="flex flex-col gap-4">
      {budgets.map((budget) => {
        const form = {
          ...baseline[budget.workspaceId],
          ...edits[budget.workspaceId],
        };
        const monthly = parseBudgetUsd(form.monthlyBudgetUsd);
        const monthlyInvalid = monthly === undefined;
        const runInvalid = parseBudgetUsd(form.runBudgetUsd) === undefined;
        const usedPct =
          typeof monthly === "number" && monthly > 0
            ? Math.min(100, (budget.usedUsd / monthly) * 100)
            : null;
        const monthlyInputId = `agentops-budget-monthly-${budget.workspaceId}`;
        const runInputId = `agentops-budget-run-${budget.workspaceId}`;

        return (
          <section
            key={budget.workspaceId}
            data-testid={`agentops-budget-${budget.workspaceId}`}
            className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--background-primary)] p-4"
          >
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {shortWorkspace(budget.workspaceId)}
                </h3>
                <p className="font-mono text-xs text-[var(--text-tertiary)]">
                  {budget.workspaceId}
                </p>
              </div>
              <span className="text-xs text-[var(--text-tertiary)]">
                {t(I18nKey.AGENTOPS$RUNS_THIS_MONTH, {
                  count: budget.runCount,
                })}
              </span>
            </header>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
                  {t(I18nKey.AGENTOPS$BUDGET_USED)}
                </span>
                <span className="text-lg font-semibold text-[var(--text-primary)]">
                  {formatCostUsd(budget.usedUsd)}
                </span>
                {budget.runsWithoutReportedCost > 0 ? (
                  <span className="text-xs text-[var(--text-tertiary)]">
                    {t(I18nKey.AGENTOPS$NO_REPORTED_COST, {
                      count: budget.runsWithoutReportedCost,
                    })}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
                  {t(I18nKey.AGENTOPS$BUDGET_REMAINING)}
                </span>
                <span className="text-lg font-semibold text-[var(--text-primary)]">
                  {budget.remainingUsd === null
                    ? t(I18nKey.AGENTOPS$BUDGET_NO_LIMIT)
                    : formatCostUsd(budget.remainingUsd)}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
                  {t(I18nKey.AGENTOPS$BUDGET_PROJECTED)}
                </span>
                <span className="text-lg font-semibold text-[var(--text-primary)]">
                  {budget.projectedUsd === null
                    ? "—"
                    : formatCostUsd(budget.projectedUsd)}
                </span>
                <span className="text-xs text-[var(--text-tertiary)]">
                  {t(I18nKey.AGENTOPS$BUDGET_PROJECTION_NOTE)}
                </span>
              </div>
            </div>

            {usedPct !== null ? (
              <span
                role="progressbar"
                aria-label={t(I18nKey.AGENTOPS$BUDGET_USED)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(usedPct)}
                className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--background-tertiary)]"
              >
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${usedPct}%`,
                    backgroundColor:
                      usedPct >= 100
                        ? "var(--error-500)"
                        : usedPct >= 80
                          ? "var(--warning-500)"
                          : "var(--primary-500)",
                  }}
                />
              </span>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
                {t(I18nKey.AGENTOPS$BUDGET_MONTHLY_LABEL)}
                <input
                  id={monthlyInputId}
                  data-testid={monthlyInputId}
                  className={INPUT_CLASS}
                  inputMode="decimal"
                  placeholder={t(I18nKey.AGENTOPS$BUDGET_NO_LIMIT)}
                  value={form.monthlyBudgetUsd}
                  aria-invalid={monthlyInvalid}
                  aria-describedby={
                    monthlyInvalid ? `${monthlyInputId}-error` : undefined
                  }
                  onChange={(event) =>
                    setField(
                      budget.workspaceId,
                      "monthlyBudgetUsd",
                      event.target.value,
                    )
                  }
                />
                {monthlyInvalid ? (
                  <span
                    id={`${monthlyInputId}-error`}
                    role="alert"
                    className="text-[11px] text-[var(--error-500)]"
                  >
                    {t(I18nKey.AGENTOPS$BUDGET_INVALID_AMOUNT)}
                  </span>
                ) : null}
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
                {t(I18nKey.AGENTOPS$BUDGET_PER_RUN_LABEL)}
                <input
                  id={runInputId}
                  data-testid={runInputId}
                  className={INPUT_CLASS}
                  inputMode="decimal"
                  placeholder={t(I18nKey.AGENTOPS$BUDGET_NO_LIMIT)}
                  value={form.runBudgetUsd}
                  aria-invalid={runInvalid}
                  aria-describedby={
                    runInvalid ? `${runInputId}-error` : undefined
                  }
                  onChange={(event) =>
                    setField(
                      budget.workspaceId,
                      "runBudgetUsd",
                      event.target.value,
                    )
                  }
                />
                {runInvalid ? (
                  <span
                    id={`${runInputId}-error`}
                    role="alert"
                    className="text-[11px] text-[var(--error-500)]"
                  >
                    {t(I18nKey.AGENTOPS$BUDGET_INVALID_AMOUNT)}
                  </span>
                ) : null}
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
                {t(I18nKey.AGENTOPS$BUDGET_AUTONOMY_LABEL)}
                <select
                  data-testid={`agentops-budget-autonomy-${budget.workspaceId}`}
                  className={INPUT_CLASS}
                  value={form.autonomyLevel}
                  onChange={(event) =>
                    setField(
                      budget.workspaceId,
                      "autonomyLevel",
                      event.target.value as AgentOpsAutonomyLevel,
                    )
                  }
                >
                  {AUTONOMY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-[var(--text-tertiary)]">
                  {t(
                    AUTONOMY_OPTIONS.find(
                      (option) => option.value === form.autonomyLevel,
                    )?.hintKey ?? I18nKey.AGENTOPS$AUTONOMY_ASSISTED_HINT,
                  )}
                </span>
              </label>
            </div>
          </section>
        );
      })}

      <div className="flex justify-end">
        <button
          type="button"
          data-testid="agentops-save-policies"
          disabled={!canSave}
          onClick={save}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--primary-500)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <Save size={14} />
          {t(I18nKey.AGENTOPS$BUDGET_SAVE)}
        </button>
      </div>
    </div>
  );
}
