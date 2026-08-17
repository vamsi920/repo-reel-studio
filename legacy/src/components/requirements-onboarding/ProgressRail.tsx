// Ported near-verbatim from document-query-flow/src/components/onboarding/ProgressRail.tsx.
import { Check, Circle, Loader2 } from "lucide-react";
import type { RequirementState } from "@/lib/requirementsOnboarding/types";

interface ProgressRailProps {
  state: RequirementState;
  generating?: boolean;
  done?: boolean;
}

interface Step {
  label: string;
  hint: string;
  filled: (s: RequirementState) => boolean;
}

const nonEmpty = (v: string | string[]) =>
  Array.isArray(v) ? v.length > 0 : v.trim().length > 0;

// Steps adapt to the project path; we show the union but score by what's filled.
const STEPS: Step[] = [
  { label: "Understand input", hint: "Goal & project name", filled: (s) => nonEmpty(s.businessGoal) },
  { label: "Classify path", hint: "Regulatory vs not", filled: (s) => s.projectType !== "unknown" },
  { label: "Users & roles", hint: "Who uses it", filled: (s) => nonEmpty(s.targetUsers) || nonEmpty(s.userRoles) },
  { label: "Workflows & features", hint: "Core behaviour", filled: (s) => nonEmpty(s.coreWorkflows) || nonEmpty(s.features) },
  { label: "Data & integrations", hint: "Objects & systems", filled: (s) => nonEmpty(s.dataEntities) || nonEmpty(s.integrations) },
  {
    label: "Controls & scope",
    hint: "Compliance / MVP",
    filled: (s) =>
      nonEmpty(s.auditAndCompliance) ||
      nonEmpty(s.regulatoryRequirements) ||
      nonEmpty(s.mvpScope) ||
      nonEmpty(s.risks),
  },
  { label: "Generate documents", hint: "BRD · FRD · Summary", filled: () => false },
];

const ProgressRail = ({ state, generating, done }: ProgressRailProps) => {
  // Index of the active step = first not-yet-filled step.
  let activeIdx = STEPS.findIndex((s) => !s.filled(state));
  if (activeIdx === -1) activeIdx = STEPS.length - 1;
  if (done) activeIdx = STEPS.length; // all complete

  return (
    <div className="onb-scroll h-full overflow-y-auto p-5">
      <div className="onb-eyebrow mb-5 flex items-center gap-2 text-slate-400">
        <span className="onb-pip live" /> Onboarding progress
      </div>

      <ol className="space-y-1">
        {STEPS.map((step, i) => {
          const isLast = i === STEPS.length - 1;
          const complete = done ? true : step.filled(state) && i < activeIdx;
          const active = !done && i === activeIdx;
          const generatingThis = isLast && generating;

          return (
            <li key={step.label} className="relative flex gap-3 pb-5 last:pb-0">
              {!isLast && (
                <span
                  className={`absolute left-[11px] top-7 h-[calc(100%-1rem)] w-px ${
                    complete ? "bg-cyan-400/40" : "bg-[var(--line)]"
                  }`}
                />
              )}
              <span
                className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                  complete
                    ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-300"
                    : active || generatingThis
                    ? "border-cyan-400/60 bg-[var(--ink-750)] text-cyan-300"
                    : "border-[var(--line-strong)] bg-[var(--ink-800)] text-slate-600"
                }`}
              >
                {complete ? (
                  <Check className="h-3.5 w-3.5" />
                ) : generatingThis ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : active ? (
                  <span className="onb-pip" />
                ) : (
                  <Circle className="h-2.5 w-2.5 fill-current" />
                )}
              </span>
              <div className="pt-0.5">
                <p
                  className={`text-sm font-medium ${
                    complete || active || generatingThis
                      ? "text-slate-100"
                      : "text-slate-500"
                  }`}
                >
                  {step.label}
                </p>
                <p className="text-xs text-slate-500">{step.hint}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default ProgressRail;
