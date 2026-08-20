import {
  Ban,
  CheckCircle2,
  CircleDollarSign,
  Flag,
  Pause,
  Play,
  ShieldQuestion,
  Wrench,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import type { AgentOpsAuditRecord } from "#/api/agentops-service/agentops-service.types";
import { formatTimestamp, shortWorkspace } from "./agentops-formatting";

/**
 * The audit trail.
 *
 * Records what the agent *did* and what people *decided*: task start/end, tool
 * calls, approval requests and decisions, budget events, pause/resume/cancel.
 * It deliberately holds no hidden chain-of-thought — the collector strips
 * `thought`, `reasoning_content` and `thinking_blocks` before anything is
 * written (see `scripts/agentops/map-events.mjs`).
 */

const ACTION_ICONS: Record<string, ReactNode> = {
  "task.started": <Flag size={14} />,
  "task.message": <Flag size={14} />,
  "task.completed": <CheckCircle2 size={14} />,
  "task.failed": <XCircle size={14} />,
  "task.error": <XCircle size={14} />,
  "tool.called": <Wrench size={14} />,
  "approval.requested": <ShieldQuestion size={14} />,
  "approval.granted": <CheckCircle2 size={14} />,
  "approval.rejected": <Ban size={14} />,
  "budget.warning": <CircleDollarSign size={14} />,
  "budget.exceeded": <CircleDollarSign size={14} />,
  "run.paused": <Pause size={14} />,
  "run.resumed": <Play size={14} />,
  "run.cancel": <Ban size={14} />,
  "policy.updated": <Flag size={14} />,
};

/** Token names, so audit rows tone-match the rest of the design system. */
const ACTION_TONES: Record<string, string> = {
  "task.failed": "var(--error-500)",
  "task.error": "var(--error-500)",
  "approval.rejected": "var(--error-500)",
  "budget.exceeded": "var(--error-500)",
  "budget.warning": "var(--warning-500)",
  "approval.requested": "var(--warning-500)",
  "run.paused": "var(--warning-500)",
  "task.completed": "var(--success-500)",
  "approval.granted": "var(--success-500)",
};

const DEFAULT_TONE = "var(--text-tertiary)";

interface AuditListProps {
  audit: AgentOpsAuditRecord[];
  emptyMessage: string;
  showWorkspace?: boolean;
}

export function AuditList({
  audit,
  emptyMessage,
  showWorkspace = false,
}: AuditListProps) {
  if (!audit.length) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-color)] p-6 text-center text-sm text-[var(--text-secondary)]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <ol
      data-testid="agentops-audit-list"
      className="flex flex-col rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--background-primary)]"
    >
      {audit.map((record) => {
        const tone = ACTION_TONES[record.action] ?? DEFAULT_TONE;
        return (
          <li
            key={record.id}
            className="flex items-start gap-3 border-b border-[var(--border-color)] px-4 py-2.5 last:border-b-0"
          >
            <span className="mt-0.5 shrink-0" style={{ color: tone }}>
              {ACTION_ICONS[record.action] ?? <Flag size={14} />}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm text-[var(--text-primary)]">
                {record.summary}
              </span>
              <span className="text-xs text-[var(--text-tertiary)]">
                {record.action} · {record.actor}
                {showWorkspace && record.workspaceId
                  ? ` · ${shortWorkspace(record.workspaceId)}`
                  : ""}
              </span>
            </div>
            <span className="shrink-0 whitespace-nowrap text-xs text-[var(--text-tertiary)]">
              {formatTimestamp(record.at)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
