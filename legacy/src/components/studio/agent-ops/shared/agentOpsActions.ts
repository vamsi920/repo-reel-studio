import { AGENT_OPS_COPY } from "@/components/studio/agent-ops/shared/agentOpsCopy";

/** Shared Agent Ops action labels and disabled-state copy. */
export const AGENT_OPS_ACTION_LABEL = {
  startRun: "Start run",
  runScan: "Run scan",
  approve: "Approve",
  dismiss: "Dismiss",
  openLinkedRun: "Open linked run",
  refresh: "Refresh",
} as const;

export function startRunDisabledReason(input: {
  isGitHub: boolean;
  hasIssueUrl: boolean;
  submitting: boolean;
}): string | null {
  if (input.submitting) return "Starting a run…";
  if (!input.isGitHub) return "Issue runs require a GitHub repository.";
  if (!input.hasIssueUrl) return "Paste a GitHub issue URL to start.";
  return null;
}

export function runScanDisabledReason(input: {
  dispatching: boolean;
  controlsLocked: boolean;
  enabled?: boolean;
}): string | null {
  if (input.dispatching) return "Scan already in progress.";
  if (input.controlsLocked) return "Wait for the current proactive action to finish.";
  if (input.enabled === false) return "Turn on proactive mode to run a scan.";
  return null;
}

export function refreshDisabledReason(input: {
  busy: boolean;
  controlsLocked?: boolean;
  scope: "runs" | "proactive" | "candidates";
}): string | null {
  if (input.busy) {
    return input.scope === "runs" ? "Run list is updating." : "Proactive status is updating.";
  }
  if (input.controlsLocked) return "Wait for the current action to finish.";
  return null;
}

export function approveRunDisabledReason(input: {
  busy: boolean;
  branch?: string;
}): string | null {
  if (input.busy) return "Approval in progress.";
  return null;
}

export function approveCandidateDisabledReason(input: {
  policyBlocked: boolean;
  approving: boolean;
  policySummary?: string | null;
}): string | null {
  if (input.approving) return "Approval in progress.";
  if (input.policyBlocked) {
    return input.policySummary?.trim() || AGENT_OPS_COPY.approvePolicyBlocked;
  }
  return null;
}

export function dismissCandidateDisabledReason(input: { dismissing: boolean }): string | null {
  if (input.dismissing) return "Dismiss in progress.";
  return null;
}
