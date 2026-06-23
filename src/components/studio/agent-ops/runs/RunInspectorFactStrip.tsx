import { humanizeRunValidation } from "@/components/studio/agent-ops/runs/runPipeline";
import type { RunDetailTab } from "@/components/studio/agent-ops/runs/runInspectorTabs";
import { AgentOpsFactChip } from "@/components/studio/agent-ops/shared/AgentOpsFactChip";
import { agentOpsFactStripClass } from "@/components/studio/agent-ops/shared/agentOpsLayout";
import type { AgentRun } from "@/lib/agentRuns";
import { cn } from "@/lib/utils";

type RunInspectorFactStripProps = {
  run: AgentRun;
  isReview: boolean;
  onOpenTab: (tab: RunDetailTab) => void;
};

export function RunInspectorFactStrip({ run, isReview, onOpenTab }: RunInspectorFactStripProps) {
  const validationStatus = run.artifacts.validation.overallStatus;
  const validationLabel = humanizeRunValidation(validationStatus);
  const fileCount = run.artifacts.changedFiles.length;
  const gates = run.artifacts.qualityGates;
  const gateLabel = gates?.recommendation ?? "n/a";
  const gateTone =
    gates?.allPassed === true ? "ok" : gates?.allPassed === false ? "warn" : ("neutral" as const);
  const prState = run.approval?.prUrl ? "PR open" : isReview ? "Review" : "No PR";

  return (
    <div
      className={cn(
        agentOpsFactStripClass,
        "border-b border-white/[0.06] px-3 py-2 sm:px-5",
      )}
      aria-label="Run facts"
    >
      <AgentOpsFactChip
        label="Validation"
        shortLabel="Val"
        value={validationLabel}
        tone={
          validationStatus === "passed"
            ? "ok"
            : validationStatus === "failed"
              ? "danger"
              : validationStatus === "partial"
                ? "warn"
                : "neutral"
        }
        tabTarget="checks"
        onOpenTab={onOpenTab}
      />
      <AgentOpsFactChip
        label="Files"
        shortLabel="Files"
        value={String(fileCount)}
        tabTarget="patch"
        onOpenTab={onOpenTab}
      />
      <AgentOpsFactChip
        label="Gates"
        shortLabel="Gate"
        value={gateLabel}
        tone={gateTone}
        tabTarget="checks"
        onOpenTab={onOpenTab}
      />
      <AgentOpsFactChip
        label="Ship"
        shortLabel="Ship"
        value={prState}
        tone={run.approval?.prUrl ? "ok" : isReview ? "warn" : "neutral"}
        tabTarget="ship"
        onOpenTab={onOpenTab}
      />
      <AgentOpsFactChip label="Map" shortLabel="Map" value="Open" tabTarget="map" onOpenTab={onOpenTab} />
    </div>
  );
}
