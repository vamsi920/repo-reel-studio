import { CheckCircle2, XCircle } from "lucide-react";

import { AgentOpsSpinner } from "@/components/studio/agent-ops/shared/AgentOpsSpinner";
import { agentOpsTransitionSlowClass } from "@/components/studio/agent-ops/shared/agentOpsMotion";

import {
  RUN_PIPELINE_STEPS,
  humanizeRunValidation,
} from "@/components/studio/agent-ops/runs/runPipeline";
import { RUN_STATUS_LABEL } from "@/components/studio/agent-ops/runs/runStatusDisplay";
import type { AgentRun, AgentRunStatus } from "@/lib/agentRuns";
import { cn } from "@/lib/utils";

type RunInspectorProgressProps = {
  phaseIndex: number;
  isActive: boolean;
  isFailed: boolean;
  status: AgentRunStatus;
  latestTitle?: string | null;
  artifacts: AgentRun["artifacts"];
  /** Hides duplicate artifact fact line when facts strip is shown above. */
  compact?: boolean;
};

export function RunInspectorProgress({
  phaseIndex,
  isActive,
  isFailed,
  status,
  latestTitle,
  artifacts,
  compact = false,
}: RunInspectorProgressProps) {
  const eventLine = pipelineEventLine({ isActive, isFailed, status, latestTitle });
  const facts = compact ? null : buildRunFacts(artifacts);

  return (
    <div className="space-y-2.5">
      <div
        className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2"
        role="list"
        aria-label="Run pipeline"
      >
        {RUN_PIPELINE_STEPS.map((step, index) => {
          const stepIndex = index + 1;
          const reached = phaseIndex >= stepIndex;
          const current = isActive && phaseIndex === stepIndex;
          const failed = isFailed && phaseIndex === stepIndex;
          const complete = reached && !current && !failed;
          const barFill =
            failed || complete || (reached && !current)
              ? "w-full"
              : current
                ? "w-1/2"
                : "w-0";
          const stepState = failed ? "failed" : current ? "in progress" : complete ? "complete" : reached ? "reached" : "pending";

          return (
            <div
              key={step.id}
              role="listitem"
              className="min-w-0"
              aria-current={current ? "step" : undefined}
              aria-label={`${step.label}, ${stepState}`}
            >
              <div className="flex items-center gap-1">
                <StepIndicator complete={complete} current={current} failed={failed} reached={reached} />
                <span
                  className={cn(
                    "truncate text-[10px] font-semibold uppercase tracking-[0.06em] sm:text-[11px]",
                    failed && "text-rose-700",
                    current && "text-primary",
                    complete && "text-emerald-700",
                    !reached && "text-muted-foreground/60",
                    reached && !failed && !current && !complete && "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div
                  className={cn(
                    "h-full rounded-full",
                    agentOpsTransitionSlowClass,
                    failed && "bg-rose-400",
                    current && !failed && "bg-primary",
                    complete && "bg-emerald-400/90",
                    reached && !complete && !current && !failed && "bg-muted-foreground/40",
                  )}
                  style={{ width: barFill === "w-0" ? "0%" : barFill === "w-1/2" ? "50%" : "100%" }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p
        className={cn(
          "min-w-0 truncate text-xs leading-5",
          isFailed ? "text-rose-600" : isActive ? "text-primary/90" : "text-muted-foreground",
        )}
        title={eventLine}
      >
        {eventLine}
      </p>

      {facts ? (
        <p className="min-w-0 truncate text-[11px] tabular-nums text-muted-foreground" title={facts}>
          {facts}
        </p>
      ) : null}
    </div>
  );
}

function StepIndicator({
  complete,
  current,
  failed,
  reached,
}: {
  complete: boolean;
  current: boolean;
  failed: boolean;
  reached: boolean;
}) {
  return (
    <span
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
        complete && "bg-emerald-300/15 text-emerald-700",
        current && !failed && "bg-primary/15 text-primary",
        failed && "bg-rose-300/15 text-rose-700",
        !reached && "bg-muted text-muted-foreground/70",
      )}
      aria-hidden
    >
      {current && !failed ? (
        <AgentOpsSpinner className="h-2.5 w-2.5" />
      ) : complete ? (
        <CheckCircle2 className="h-2.5 w-2.5" />
      ) : failed ? (
        <XCircle className="h-2.5 w-2.5" />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
      )}
    </span>
  );
}

function pipelineEventLine({
  isActive,
  isFailed,
  status,
  latestTitle,
}: {
  isActive: boolean;
  isFailed: boolean;
  status: AgentRunStatus;
  latestTitle?: string | null;
}) {
  if (isFailed) return latestTitle || RUN_STATUS_LABEL[status] || "Run failed";
  if (isActive) return latestTitle || "Run in progress";
  if (status === "awaiting_review") return latestTitle || "Awaiting review";
  return latestTitle || RUN_STATUS_LABEL[status];
}

function buildRunFacts(artifacts: AgentRun["artifacts"]): string {
  const files = `${artifacts.changedFiles.length} file${artifacts.changedFiles.length === 1 ? "" : "s"}`;
  const validation = humanizeRunValidation(artifacts.validation.overallStatus);
  const recommendation = artifacts.qualityGates?.recommendation ?? "n/a";
  const evidence = artifacts.changeIntent?.evidenceSufficiency ?? "n/a";
  return `${files} · validation ${validation} · ${recommendation} · evidence ${evidence}`;
}
