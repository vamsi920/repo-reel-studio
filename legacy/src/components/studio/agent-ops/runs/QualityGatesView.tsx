import { Shield, ShieldCheck } from "lucide-react";

import { MetricPill } from "@/components/studio/agent-ops/shared/MetricPill";
import { statusAriaLabel } from "@/components/studio/agent-ops/shared/agentOpsA11y";
import { AGENT_OPS_COPY } from "@/components/studio/agent-ops/shared/agentOpsCopy";
import { TabEmpty } from "@/components/studio/agent-ops/shared/TabEmpty";
import type { AgentRun, QualityGateEntry, QualityGates } from "@/lib/agentRuns";
import { cn } from "@/lib/utils";

type QualityGatesViewProps = {
  qualityGates: QualityGates | null;
  evaluation: AgentRun["evaluation"];
  metrics: AgentRun["metrics"] | null | undefined;
};

export function QualityGatesView({ qualityGates, evaluation, metrics }: QualityGatesViewProps) {
  const gates = qualityGates?.gates ?? [];
  const showMetrics = hasRunMetrics(metrics);

  return (
    <article className="min-w-0 space-y-5">
      <section aria-label="Quality gates">
        <header className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Quality gates</h3>
          {qualityGates ? (
            <span
              aria-label={statusAriaLabel("Recommendation", qualityGates.recommendation)}
              className={cn("rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize", recommendationTone(qualityGates.recommendation))}
            >
              {qualityGates.recommendation}
            </span>
          ) : null}
          {qualityGates ? (
            <span className="text-xs text-muted-foreground">{qualityGates.allPassed ? "All passed" : "Needs attention"}</span>
          ) : null}
        </header>

        {gates.length > 0 ? (
          <ul className="divide-y divide-border rounded-md border border-border">
            {gates.map((gate) => (
              <GateRow key={gate.gate} gate={gate} />
            ))}
          </ul>
        ) : (
          <TabEmpty>{AGENT_OPS_COPY.noQualityGates}</TabEmpty>
        )}
      </section>

      <section aria-label="Risk and confidence">
        <h3 className="text-sm font-semibold text-foreground">Risk and confidence</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <EvalCard
            title="Risk"
            level={evaluation.riskLevel}
            score={evaluation.riskScore}
            reasons={evaluation.riskReasons ?? []}
            tone="risk"
          />
          <EvalCard
            title="Confidence"
            level={evaluation.confidenceLevel}
            score={evaluation.confidenceScore}
            reasons={evaluation.confidenceReasons ?? []}
            tone="neutral"
          />
        </div>
      </section>

      {showMetrics && metrics ? (
        <section aria-label="Run metrics">
          <h3 className="text-sm font-semibold text-foreground">Run metrics</h3>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <MetricPill label="Planning attempts" value={`${metrics.planningAttempts}`} />
            <MetricPill label="Patch attempts" value={`${metrics.patchAttempts}`} />
            <MetricPill label="Critique iterations" value={`${metrics.critiqueIterations}`} />
            <MetricPill label="Validation depth" value={`${metrics.validationDepth}`} />
            <MetricPill label="Artifact confidence" value={`${Math.round(metrics.artifactConfidence * 100)}%`} />
            <MetricPill label="Tokens used" value={`${metrics.totalTokensUsed}`} />
          </div>
        </section>
      ) : null}
    </article>
  );
}

function GateRow({ gate }: { gate: QualityGateEntry }) {
  const failed = gate.status === "failed";
  const detail = gate.detail?.trim() || null;

  return (
    <li
      className={cn(
        "flex min-w-0 items-start gap-2 px-3 py-2.5",
        failed && "border-l-2 border-rose-400/35 bg-rose-950/[0.08]",
      )}
    >
      <GateIcon status={gate.status} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium capitalize text-foreground">{gate.gate.replace(/_/g, " ")}</span>
          <GateStatusChip status={gate.status} />
        </div>
        {detail ? (
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground" title={detail}>
            {detail}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function GateIcon({ status }: { status: QualityGateEntry["status"] }) {
  if (status === "passed") {
    return <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />;
  }
  return <Shield className={cn("mt-0.5 h-4 w-4 shrink-0", status === "failed" ? "text-rose-600" : "text-muted-foreground/60")} aria-hidden />;
}

function GateStatusChip({ status }: { status: QualityGateEntry["status"] }) {
  const label = humanizeGateStatus(status);
  const tone =
    status === "passed"
      ? "text-emerald-700"
      : status === "failed"
        ? "text-rose-700"
        : "text-muted-foreground";

  return (
    <span aria-label={statusAriaLabel("Gate status", label)} className={cn("text-[11px] font-medium capitalize", tone)}>
      {label}
    </span>
  );
}

function humanizeGateStatus(status: QualityGateEntry["status"]) {
  return status.replace(/_/g, " ");
}

function EvalCard({
  title,
  level,
  score,
  reasons,
  tone,
}: {
  title: string;
  level: string;
  score: number;
  reasons: string[];
  tone: "risk" | "neutral";
}) {
  return (
    <div className="rounded-md border border-border bg-muted/60 px-3 py-2.5">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="text-base font-semibold capitalize text-foreground">{level}</span>
        <span className="text-xs tabular-nums text-muted-foreground">score {score}</span>
      </div>
      {reasons.length > 0 ? (
        <ul className="mt-2 space-y-1 border-t border-border pt-2">
          {reasons.map((reason) => (
            <li
              key={reason}
              className={cn(
                "text-xs leading-5",
                tone === "risk" ? "text-amber-700" : "text-muted-foreground",
              )}
            >
              {reason}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">No reasons recorded.</p>
      )}
    </div>
  );
}

function recommendationTone(recommendation: QualityGates["recommendation"]) {
  if (recommendation === "ship") return "border-emerald-300/25 bg-emerald-300/8 text-emerald-700";
  if (recommendation === "review") return "border-amber-300/25 bg-amber-300/8 text-amber-700";
  return "border-rose-300/25 bg-rose-300/8 text-rose-700";
}

function hasRunMetrics(metrics: AgentRun["metrics"] | null | undefined): metrics is AgentRun["metrics"] {
  return Boolean(metrics && typeof metrics.planningAttempts === "number");
}
