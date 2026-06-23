import type { AgentRunStatus } from "@/lib/agentRuns";

import {
  AGENT_OPS_STATUS_BADGE_BASE,
  AGENT_OPS_STATUS_BADGE_SIZE,
  AGENT_OPS_STATUS_TONE_CLASS,
  type AgentOpsStatusTone,
} from "@/components/studio/agent-ops/shared/agentOpsStatusTokens";
import { cn } from "@/lib/utils";

export type RunStatusDisplay = {
  key: string;
  label: string;
  shortLabel: string;
  tone: AgentOpsStatusTone;
  known: boolean;
};

const RUN_STATUS_ENTRIES: Record<string, Omit<RunStatusDisplay, "key" | "known">> = {
  queued: { label: "Queued", shortLabel: "Queued", tone: "neutral" },
  preparing: { label: "Preparing", shortLabel: "Prep", tone: "info" },
  running: { label: "Running", shortLabel: "Running", tone: "active" },
  validating: { label: "Validating", shortLabel: "Validating", tone: "active" },
  awaiting_review: { label: "Awaiting review", shortLabel: "Review", tone: "review" },
  approved: { label: "Approved", shortLabel: "Approved", tone: "success" },
  rejected: { label: "Rejected", shortLabel: "Rejected", tone: "danger" },
  failed: { label: "Failed", shortLabel: "Failed", tone: "danger" },
  expired: { label: "Expired", shortLabel: "Expired", tone: "muted" },
  cancelled: { label: "Cancelled", shortLabel: "Cancelled", tone: "muted" },
};

export function normalizeRunStatusKey(status: unknown): string {
  return String(status ?? "")
    .trim()
    .replace(/-/g, "_")
    .toLowerCase();
}

function humanizeUnknownStatusKey(key: string): string {
  if (!key) return "Unknown";
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function resolveRunStatusDisplay(status: unknown): RunStatusDisplay {
  const key = normalizeRunStatusKey(status);
  const entry = RUN_STATUS_ENTRIES[key];
  if (entry) {
    return { key, known: true, ...entry };
  }
  const label = humanizeUnknownStatusKey(key);
  return { key: key || "unknown", label, shortLabel: label, tone: "neutral", known: false };
}

/** @deprecated Use resolveRunStatusDisplay — kept for existing imports. */
export const RUN_STATUS_LABEL: Record<AgentRunStatus, string> = {
  queued: "Queued",
  preparing: "Preparing",
  running: "Running",
  validating: "Validating",
  awaiting_review: "Awaiting review",
  approved: "Approved",
  rejected: "Rejected",
  failed: "Failed",
  expired: "Expired",
  cancelled: "Cancelled",
};

/** @deprecated Use resolveRunStatusDisplay + runStatusBadgeClass. */
export const RUN_STATUS_ACCENTS: Record<AgentRunStatus, string> = {
  queued: runStatusBadgeClass("queued"),
  preparing: runStatusBadgeClass("preparing"),
  running: runStatusBadgeClass("running"),
  validating: runStatusBadgeClass("validating"),
  awaiting_review: runStatusBadgeClass("awaiting_review"),
  approved: runStatusBadgeClass("approved"),
  rejected: runStatusBadgeClass("rejected"),
  failed: runStatusBadgeClass("failed"),
  expired: runStatusBadgeClass("expired"),
  cancelled: runStatusBadgeClass("cancelled"),
};

/** @deprecated Use resolveRunStatusDisplay. */
export const RUN_STATUS_SHORT_LABEL: Record<AgentRunStatus, string> = {
  queued: "Queued",
  preparing: "Prep",
  running: "Running",
  validating: "Validating",
  awaiting_review: "Review",
  approved: "Approved",
  rejected: "Rejected",
  failed: "Failed",
  expired: "Expired",
  cancelled: "Cancelled",
};

export function runStatusLabel(status: unknown, variant: "full" | "short" = "full"): string {
  const display = resolveRunStatusDisplay(status);
  return variant === "short" ? display.shortLabel : display.label;
}

export function runStatusBadgeClass(
  status: unknown,
  size: keyof typeof AGENT_OPS_STATUS_BADGE_SIZE = "sm",
): string {
  const display = resolveRunStatusDisplay(status);
  return cn(
    AGENT_OPS_STATUS_BADGE_BASE,
    AGENT_OPS_STATUS_BADGE_SIZE[size],
    AGENT_OPS_STATUS_TONE_CLASS[display.tone],
    !display.known && "border-dashed",
  );
}
