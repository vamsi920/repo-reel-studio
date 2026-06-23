import type { ProactiveCandidate, ProactiveCandidateStatus, ProactiveCandidateType } from "@/lib/proactiveAgentOps";

import {
  AGENT_OPS_STATUS_BADGE_BASE,
  AGENT_OPS_STATUS_BADGE_SIZE,
  AGENT_OPS_STATUS_TONE_CLASS,
  AGENT_OPS_TYPE_TONE_CLASS,
  type AgentOpsStatusTone,
} from "@/components/studio/agent-ops/shared/agentOpsStatusTokens";
import { cn } from "@/lib/utils";

export type ProactiveStatusDisplay = {
  key: string;
  label: string;
  tone: AgentOpsStatusTone;
  known: boolean;
};

export type ProactiveTypeDisplay = {
  key: string;
  label: string;
  tone: AgentOpsStatusTone;
  known: boolean;
};

const PROACTIVE_STATUS_ENTRIES: Record<string, Omit<ProactiveStatusDisplay, "key" | "known">> = {
  observed: { label: "Observed", tone: "neutral" },
  selected: { label: "Selected", tone: "info" },
  executing: { label: "Executing", tone: "active" },
  review_ready: { label: "Review ready", tone: "success" },
  needs_execution: { label: "Needs execution", tone: "review" },
  dismissed: { label: "Dismissed", tone: "muted" },
  not_selected: { label: "Not selected", tone: "muted" },
  discovered: { label: "Discovered", tone: "neutral" },
  discovering: { label: "Discovering", tone: "active" },
  scoring: { label: "Scoring", tone: "active" },
  patching: { label: "Patching", tone: "active" },
  validating: { label: "Validating", tone: "active" },
  preparing: { label: "Preparing", tone: "active" },
  workspace_ready: { label: "Workspace ready", tone: "info" },
  approved: { label: "Approved", tone: "success" },
  approved_internal: { label: "Approved internal", tone: "success" },
};

const PROACTIVE_TYPE_ENTRIES: Record<string, Omit<ProactiveTypeDisplay, "key" | "known">> = {
  bug: { label: "Bug", tone: "danger" },
  perf: { label: "Perf", tone: "info" },
  improvement: { label: "Improvement", tone: "neutral" },
  reliability: { label: "Reliability", tone: "review" },
};

export function normalizeProactiveStatusKey(status: unknown): string {
  return String(status ?? "")
    .trim()
    .replace(/-/g, "_")
    .toLowerCase();
}

export function normalizeProactiveTypeKey(type: unknown): string {
  return String(type ?? "")
    .trim()
    .replace(/-/g, "_")
    .toLowerCase();
}

function humanizeUnknownKey(key: string): string {
  if (!key) return "Unknown";
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function resolveProactiveStatusDisplay(
  status: unknown,
  executionFailure?: ProactiveCandidate["executionFailure"],
): ProactiveStatusDisplay {
  const key = normalizeProactiveStatusKey(status);
  const entry = PROACTIVE_STATUS_ENTRIES[key];

  if (key === "needs_execution" && executionFailure?.isNoPatch) {
    return { key, label: "No patch", tone: "review", known: true };
  }
  if (key === "needs_execution" && executionFailure?.isBackendCrash) {
    return { key, label: "Executor error", tone: "danger", known: true };
  }

  if (entry) {
    return { key, known: true, ...entry };
  }

  const label = humanizeUnknownKey(key);
  return { key: key || "unknown", label, tone: "neutral", known: false };
}

export function resolveProactiveTypeDisplay(type: unknown): ProactiveTypeDisplay {
  const key = normalizeProactiveTypeKey(type);
  const entry = PROACTIVE_TYPE_ENTRIES[key];
  if (entry) {
    return { key, known: true, ...entry };
  }
  const label = humanizeUnknownKey(key || "improvement");
  return { key: key || "unknown", label, tone: "neutral", known: false };
}

export function proactiveStatusBadgeClass(
  status: ProactiveCandidateStatus | string,
  executionFailure?: ProactiveCandidate["executionFailure"],
  size: keyof typeof AGENT_OPS_STATUS_BADGE_SIZE = "sm",
): string {
  const display = resolveProactiveStatusDisplay(status, executionFailure);
  return cn(
    AGENT_OPS_STATUS_BADGE_BASE,
    AGENT_OPS_STATUS_BADGE_SIZE[size],
    AGENT_OPS_STATUS_TONE_CLASS[display.tone],
    !display.known && "border-dashed",
  );
}

export function proactiveTypeBadgeClass(
  type: ProactiveCandidateType | string,
  size: keyof typeof AGENT_OPS_STATUS_BADGE_SIZE = "sm",
): string {
  const display = resolveProactiveTypeDisplay(type);
  return cn(
    AGENT_OPS_STATUS_BADGE_BASE,
    AGENT_OPS_STATUS_BADGE_SIZE[size],
    AGENT_OPS_TYPE_TONE_CLASS[display.tone],
    !display.known && "border-dashed",
  );
}

/** @deprecated Use resolveProactiveStatusDisplay */
export function humanizeCandidateStatus(
  status: ProactiveCandidateStatus,
  executionFailure?: ProactiveCandidate["executionFailure"],
) {
  return resolveProactiveStatusDisplay(status, executionFailure).label;
}

/** @deprecated Use resolveProactiveTypeDisplay */
export function humanizeCandidateType(type: ProactiveCandidateType) {
  return resolveProactiveTypeDisplay(type).label;
}

/** @deprecated Use resolveProactiveStatusDisplay */
export function candidateStatusTone(
  status: ProactiveCandidateStatus,
  executionFailure?: ProactiveCandidate["executionFailure"],
): AgentOpsStatusTone {
  return resolveProactiveStatusDisplay(status, executionFailure).tone;
}
