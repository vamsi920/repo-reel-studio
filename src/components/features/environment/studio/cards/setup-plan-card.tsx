import { useTranslation } from "react-i18next";
import { Check, Circle, CircleDashed, SkipForward } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { useOnboardingStudioStore } from "#/stores/onboarding-studio-store";
import type { SetupStep } from "#/stores/onboarding-studio-store";

const STEP_ICON = {
  done: Check,
  active: Circle,
  pending: CircleDashed,
  skipped: SkipForward,
} as const;

/**
 * The plan the agent authored, with the current step marked.
 *
 * The list is the agent's, not a fixed script: a company with no issue tracker
 * should never be shown a Jira step just because the product supports one.
 */
export function SetupPlanCard() {
  const { t } = useTranslation("openhands");
  const steps = useOnboardingStudioStore((state) => state.steps);
  const currentStepId = useOnboardingStudioStore(
    (state) => state.currentStepId,
  );

  const done = steps.filter((step: SetupStep) => step.status === "done").length;

  return (
    <div
      data-testid="workbench-plan-card"
      className="ame-card flex flex-col gap-3 p-4"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="ame-eyebrow">
          {t(I18nKey.ENVIRONMENT$STUDIO_PLAN_TITLE)}
        </span>
        <span className="text-xs text-[var(--text-tertiary)]">
          {`${done}/${steps.length}`}
        </span>
      </div>

      <ol className="flex flex-col gap-1.5">
        {steps.map((step) => {
          const Icon = STEP_ICON[step.status];
          const isCurrent = step.id === currentStepId;
          return (
            <li
              key={step.id}
              data-testid={`plan-step-${step.id}`}
              data-status={step.status}
              className={cn(
                "flex items-start gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm",
                isCurrent && "bg-[var(--background-secondary)]",
              )}
            >
              <Icon
                size={14}
                aria-hidden
                className={cn(
                  "mt-0.5 shrink-0",
                  step.status === "done"
                    ? "text-[var(--success-500)]"
                    : isCurrent
                      ? "text-[var(--primary-500)]"
                      : "text-[var(--text-tertiary)]",
                )}
              />
              <span
                className={cn(
                  "min-w-0",
                  step.status === "done"
                    ? "text-[var(--text-tertiary)] line-through"
                    : "text-[var(--text-primary)]",
                )}
              >
                {step.title}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
