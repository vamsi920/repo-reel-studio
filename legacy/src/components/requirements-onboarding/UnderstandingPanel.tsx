// Ported near-verbatim from document-query-flow/src/components/onboarding/UnderstandingPanel.tsx.
import { ShieldAlert, Layers, AlertCircle, Lightbulb } from "lucide-react";
import type { ProjectType, RequirementState } from "@/lib/requirementsOnboarding/types";

interface UnderstandingPanelProps {
  state: RequirementState;
  classificationReasoning?: string;
}

const PathBadge = ({ type }: { type: ProjectType }) => {
  const map: Record<ProjectType, { label: string; cls: string; dot: string }> = {
    regulatory: {
      label: "Regulatory",
      cls: "border-amber-400/40 bg-amber-400/10 text-amber-200",
      dot: "bg-amber-300",
    },
    "non-regulatory": {
      label: "Non-Regulatory",
      cls: "border-cyan-400/40 bg-cyan-400/10 text-cyan-200",
      dot: "bg-cyan-300",
    },
    unknown: {
      label: "Determining…",
      cls: "border-slate-500/40 bg-slate-500/10 text-slate-300",
      dot: "bg-slate-400",
    },
  };
  const v = map[type];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${v.cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${v.dot}`} />
      {v.label}
    </span>
  );
};

const CompletenessRing = ({ score }: { score: number }) => {
  const r = 26;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, score)) / 100) * c;
  const color =
    score >= 80 ? "#22e0ff" : score >= 50 ? "#fbbf24" : "#64748b";
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--line)" strokeWidth="5" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="onb-figure text-sm text-slate-100">{score}</span>
      </div>
    </div>
  );
};

const Section = ({
  title,
  items,
  highlight,
}: {
  title: string;
  items: string[];
  highlight?: boolean;
}) => {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className="onb-eyebrow mb-1.5 text-slate-400">{title}</p>
      <ul className="space-y-1">
        {items.map((it, i) => {
          const isAssumption = /^assumption:/i.test(it);
          return (
            <li
              key={i}
              className={`flex gap-2 text-sm leading-snug ${
                highlight || isAssumption ? "text-amber-200" : "text-slate-300"
              }`}
            >
              <span
                className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${
                  highlight || isAssumption ? "bg-amber-300" : "bg-cyan-400/70"
                }`}
              />
              <span>{it.replace(/^assumption:\s*/i, "")}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const UnderstandingPanel = ({
  state,
  classificationReasoning,
}: UnderstandingPanelProps) => {
  const isReg = state.projectType === "regulatory";

  return (
    <div className="onb-scroll flex h-full flex-col overflow-y-auto">
      {/* Header: path + completeness */}
      <div className="border-b border-[var(--line)] p-5">
        <div className="onb-eyebrow mb-3 flex items-center gap-2 text-slate-400">
          <Layers className="h-3.5 w-3.5" /> Current understanding
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <PathBadge type={state.projectType} />
            <p className="mt-2 truncate text-sm font-semibold text-slate-100">
              {state.projectName || "Untitled project"}
            </p>
          </div>
          <div className="text-center">
            <CompletenessRing score={state.completenessScore} />
            <p className="onb-eyebrow mt-1 text-[0.6rem] text-slate-500">
              Complete
            </p>
          </div>
        </div>
        {classificationReasoning && (
          <p className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--ink-850)] p-2.5 text-xs leading-relaxed text-slate-400">
            <ShieldAlert className="mr-1 inline h-3.5 w-3.5 text-cyan-300" />
            {classificationReasoning}
          </p>
        )}
      </div>

      {/* Body: captured requirement state */}
      <div className="space-y-4 p-5">
        {state.businessGoal && (
          <div>
            <p className="onb-eyebrow mb-1.5 text-slate-400">Business goal</p>
            <p className="text-sm leading-relaxed text-slate-200">
              {state.businessGoal}
            </p>
          </div>
        )}
        <Section title="Target users" items={state.targetUsers} />
        <Section title="User roles" items={state.userRoles} />
        <Section title="Core workflows" items={state.coreWorkflows} />
        <Section title="Features" items={state.features} />
        <Section title="Data entities" items={state.dataEntities} />
        <Section title="Integrations" items={state.integrations} />
        {isReg && (
          <>
            <Section
              title="Regulatory requirements"
              items={state.regulatoryRequirements}
            />
            <Section
              title="Audit & compliance"
              items={state.auditAndCompliance}
            />
          </>
        )}
        <Section
          title="Non-functional"
          items={state.nonFunctionalRequirements}
        />
        <Section title="MVP scope" items={state.mvpScope} />
        <Section title="Future scope" items={state.futureScope} />
        <Section title="Out of scope" items={state.outOfScope} />
        <Section title="Risks" items={state.risks} />
        <Section title="Assumptions" items={state.assumptions} highlight />

        {/* Missing details */}
        {state.missingDetails && state.missingDetails.length > 0 && (
          <div className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-3">
            <p className="onb-eyebrow mb-2 flex items-center gap-1.5 text-amber-300">
              <AlertCircle className="h-3.5 w-3.5" /> Still missing
            </p>
            <ul className="space-y-1">
              {state.missingDetails.map((m, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-sm leading-snug text-amber-100/90"
                >
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-300" />
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {state.completenessScore === 0 &&
          !state.businessGoal &&
          state.targetUsers.length === 0 && (
            <div className="flex flex-col items-center py-8 text-center text-slate-500">
              <Lightbulb className="mb-2 h-6 w-6 text-slate-600" />
              <p className="text-sm">
                Your requirement state will build up here as you answer.
              </p>
            </div>
          )}
      </div>
    </div>
  );
};

export default UnderstandingPanel;
