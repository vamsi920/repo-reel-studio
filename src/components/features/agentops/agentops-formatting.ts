/**
 * Presentation helpers shared by the Control Tower surfaces.
 *
 * Token counts reuse `formatCompactTokenCount` so AgentOps and the
 * conversation Usage tab render the same number the same way — the acceptance
 * test cross-checks those two surfaces against each other.
 */

import { formatCompactTokenCount } from "#/utils/format-token-count";
import { I18nKey } from "#/i18n/declaration";
import type {
  AgentOpsRunPhase,
  AgentOpsRunStatus,
} from "#/api/agentops-service/agentops-service.types";

export { formatCompactTokenCount };

/**
 * Cost, at the precision the number actually carries. Sub-cent agent runs are
 * the common case, so rounding to 2dp would render most runs as "$0.00".
 */
export function formatCostUsd(value: number | null | undefined): string {
  if (typeof value !== "number") return "—";
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

export function formatElapsed(
  startedAt: string,
  endedAt: string | null,
): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export const RUN_STATUS_LABEL_KEYS: Record<AgentOpsRunStatus, I18nKey> = {
  idle: I18nKey.AGENTOPS$STATUS_IDLE,
  running: I18nKey.AGENTOPS$STATUS_RUNNING,
  paused: I18nKey.AGENTOPS$STATUS_PAUSED,
  waiting_for_confirmation: I18nKey.AGENTOPS$STATUS_WAITING_FOR_CONFIRMATION,
  finished: I18nKey.AGENTOPS$STATUS_FINISHED,
  error: I18nKey.AGENTOPS$STATUS_ERROR,
  stuck: I18nKey.AGENTOPS$STATUS_STUCK,
};

/** Token names, so status colour stays consistent with the design system. */
export const RUN_STATUS_COLORS: Record<AgentOpsRunStatus, string> = {
  idle: "var(--text-tertiary)",
  running: "var(--primary-500)",
  paused: "var(--warning-500)",
  waiting_for_confirmation: "var(--warning-500)",
  finished: "var(--success-500)",
  error: "var(--error-500)",
  stuck: "var(--error-500)",
};

export const RUN_PHASES: AgentOpsRunPhase[] = [
  "planning",
  "repository_inspection",
  "tool_call",
  "code_edit",
  "tests",
  "review",
  "waiting_approval",
  "completed",
];

export const RUN_PHASE_LABEL_KEYS: Record<AgentOpsRunPhase, I18nKey> = {
  planning: I18nKey.AGENTOPS$PHASE_PLANNING,
  repository_inspection: I18nKey.AGENTOPS$PHASE_REPOSITORY_INSPECTION,
  tool_call: I18nKey.AGENTOPS$PHASE_TOOL_CALL,
  code_edit: I18nKey.AGENTOPS$PHASE_CODE_EDIT,
  tests: I18nKey.AGENTOPS$PHASE_TESTS,
  review: I18nKey.AGENTOPS$PHASE_REVIEW,
  waiting_approval: I18nKey.AGENTOPS$PHASE_WAITING_APPROVAL,
  completed: I18nKey.AGENTOPS$PHASE_COMPLETED,
};

/**
 * Progress through the run's phases. This is a position in the phase order, not
 * a completion estimate — the agent-server does not report one, and inventing a
 * percentage would be the same class of lie as inventing a cost.
 */
export function phaseProgressPercent(phase: AgentOpsRunPhase): number {
  const index = RUN_PHASES.indexOf(phase);
  if (index < 0) return 0;
  return Math.round(((index + 1) / RUN_PHASES.length) * 100);
}

/** Last path segment of a workspace directory, for narrow table columns. */
export function shortWorkspace(workspaceId: string): string {
  if (!workspaceId || workspaceId === "unknown") return "—";
  const parts = workspaceId.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? workspaceId;
}
