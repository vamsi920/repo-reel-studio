import type { ProactiveInspectorTab } from "@/components/studio/agent-ops/proactive/proactiveInspectorTabs";
import { AgentOpsFactChip } from "@/components/studio/agent-ops/shared/AgentOpsFactChip";
import { agentOpsFactStripClass } from "@/components/studio/agent-ops/shared/agentOpsLayout";
import type { ProactiveCandidate } from "@/lib/proactiveAgentOps";
import { cn } from "@/lib/utils";

type ProactiveCandidateFactStripProps = {
  candidate: ProactiveCandidate;
  onOpenTab: (tab: ProactiveInspectorTab) => void;
};

export function ProactiveCandidateFactStrip({ candidate, onOpenTab }: ProactiveCandidateFactStripProps) {
  const linkedRun = candidate.linkedRun ?? null;
  const validation = linkedRun?.validation?.overallStatus ?? "not_run";
  const validationLabel =
    validation === "not_run"
      ? "Not run"
      : validation.charAt(0).toUpperCase() + validation.slice(1).replace(/_/g, " ");
  const fileCount = linkedRun?.changedFiles?.length ?? 0;
  const gates = linkedRun?.qualityGates;
  const gateLabel = gates?.recommendation ?? "n/a";
  const policyBlocked =
    Boolean(candidate.prApprovalBlocked) ||
    candidate.policyStatus === "blocked" ||
    Boolean(linkedRun?.prApprovalBlocked);

  return (
    <div
      className={cn(agentOpsFactStripClass, "border-b border-border px-3 py-2 sm:px-4")}
      aria-label="Candidate facts"
    >
      <AgentOpsFactChip
        label="Validation"
        shortLabel="Val"
        value={validationLabel}
        tone={
          validation === "passed" ? "ok" : validation === "failed" ? "danger" : validation === "partial" ? "warn" : "neutral"
        }
        onClick={() => onOpenTab("checks")}
      />
      <AgentOpsFactChip
        label="Files"
        shortLabel="Files"
        value={String(fileCount)}
        onClick={() => onOpenTab("checks")}
      />
      <AgentOpsFactChip
        label="Gates"
        shortLabel="Gate"
        value={gateLabel}
        tone={gates?.allPassed ? "ok" : gates ? "warn" : "neutral"}
        onClick={() => onOpenTab("checks")}
      />
      <AgentOpsFactChip
        label="Policy"
        shortLabel="Pol"
        value={policyBlocked ? "Blocked" : candidate.policyStatus === "warning" ? "Warn" : "Clear"}
        tone={policyBlocked ? "danger" : candidate.policyStatus === "warning" ? "warn" : "ok"}
        onClick={() => onOpenTab("checks")}
      />
      <AgentOpsFactChip label="Log" shortLabel="Log" value="Open" onClick={() => onOpenTab("log")} />
    </div>
  );
}
