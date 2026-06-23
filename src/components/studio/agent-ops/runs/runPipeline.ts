import type { AgentRun, AgentRunStatus } from "@/lib/agentRuns";

/** Maps run status to pipeline phase (0 = queued, 4 = awaiting review, 5 = terminal). */
export const RUN_PHASE_INDEX: Partial<Record<AgentRunStatus, number>> = {
  queued: 0,
  preparing: 1,
  running: 2,
  validating: 3,
  awaiting_review: 4,
  approved: 5,
  rejected: 5,
  failed: 5,
  cancelled: 5,
  expired: 5,
};

export const RUN_PIPELINE_STEPS = [
  { id: "preparing" as const, label: "Prepare" },
  { id: "running" as const, label: "Patch" },
  { id: "validating" as const, label: "Validate" },
  { id: "awaiting_review" as const, label: "Review" },
] as const;

export const RUN_ACTIVE_STATUSES: AgentRunStatus[] = ["queued", "preparing", "running", "validating"];

export function getRunPhaseIndex(status: AgentRunStatus): number {
  return RUN_PHASE_INDEX[status] ?? 0;
}

export function humanizeRunValidation(
  status: AgentRun["artifacts"]["validation"]["overallStatus"],
): string {
  if (status === "not_run") return "not run";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
