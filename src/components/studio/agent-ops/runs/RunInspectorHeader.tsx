import {
  CheckCircle2,
  Clock,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  XCircle,
} from "lucide-react";

import { RunStatusBadge } from "@/components/studio/agent-ops/shared/AgentOpsStatusBadge";
import { statusAriaLabel } from "@/components/studio/agent-ops/shared/agentOpsA11y";
import {
  AGENT_OPS_ACTION_LABEL,
  approveRunDisabledReason,
  refreshDisabledReason,
} from "@/components/studio/agent-ops/shared/agentOpsActions";
import { AgentOpsActionButton } from "@/components/studio/agent-ops/shared/AgentOpsActionButton";
import { agentOpsActionMinWidth } from "@/components/studio/agent-ops/shared/agentOpsDimensions";
import { fmtRelative } from "@/components/studio/agent-ops/shared/timeFormat";
import { Input } from "@/components/ui/input";
import type { AgentRun } from "@/lib/agentRuns";
import { cn } from "@/lib/utils";

const BRANCH_INPUT_ID = "agent-ops-approve-branch";

type RunInspectorHeaderProps = {
  run: AgentRun;
  isActive: boolean;
  isReview: boolean;
  isFailed: boolean;
  action: "approve" | "reject" | "cancel" | "retry" | null;
  refreshing: boolean;
  approveBranch: string;
  onApproveBranchChange: (value: string) => void;
  onRefresh: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onApprove: () => void;
  onReject: () => void;
};

export function RunInspectorHeader({
  run,
  isActive,
  isReview,
  isFailed,
  action,
  refreshing,
  approveBranch,
  onApproveBranchChange,
  onRefresh,
  onCancel,
  onRetry,
  onApprove,
  onReject,
}: RunInspectorHeaderProps) {
  const title = run.issue?.title ?? "Fix attempt";
  const summary = run.plan?.summary?.trim() || run.issue?.body?.trim();
  const refLabel = run.issue?.number ? `Issue #${run.issue.number}` : "Run";
  const showRetry = isFailed || run.status === "rejected";

  return (
    <header className="space-y-3 border-b border-white/[0.06] px-4 py-3 sm:px-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <RunStatusBadge status={run.status} />
            <MetaChip label="Risk" value={run.evaluation.riskLevel} />
            <MetaChip label="Confidence" value={run.evaluation.confidenceLevel} />
          </div>

          <h3
            className="min-w-0 break-words text-base font-semibold leading-snug text-white line-clamp-2"
            title={title}
          >
            {title}
          </h3>

          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-white/40">
            <span className="shrink-0">{refLabel}</span>
            <span className="text-white/20" aria-hidden>
              ·
            </span>
            <span className="shrink-0 font-mono tabular-nums">{run.id.slice(0, 8)}</span>
            <span className="text-white/20" aria-hidden>
              ·
            </span>
            <time className="shrink-0 tabular-nums" dateTime={run.updatedAt}>
              {fmtRelative(run.updatedAt)}
            </time>
            {run.issue?.htmlUrl ? (
              <>
                <span className="text-white/20" aria-hidden>
                  ·
                </span>
                <a
                  href={run.issue.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-w-0 max-w-full items-center gap-1 truncate text-primary hover:text-white"
                >
                  GitHub
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </>
            ) : null}
          </div>

          {summary ? (
            <p className="line-clamp-2 text-xs leading-5 text-white/46" title={summary}>
              {summary}
            </p>
          ) : null}
        </div>

        <div className="flex w-full min-w-0 shrink-0 flex-wrap gap-1.5 sm:w-auto lg:max-w-[min(100%,280px)] lg:justify-end">
          <AgentOpsActionButton
            type="button"
            intent="tertiary"
            size="sm"
            className={cn("min-h-10 px-2.5 text-xs sm:min-h-8 sm:h-8", agentOpsActionMinWidth.refresh)}
            onClick={onRefresh}
            disabled={refreshing}
            disabledReason={refreshDisabledReason({ busy: refreshing, scope: "runs" })}
            loading={refreshing}
            loadingLabel="Refreshing…"
          >
            {!refreshing ? <RefreshCw className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
            {AGENT_OPS_ACTION_LABEL.refresh}
          </AgentOpsActionButton>

          {isActive ? (
            <AgentOpsActionButton
              type="button"
              intent="tertiary"
              size="sm"
              className={cn(
                "min-h-10 border-amber-300/20 bg-amber-300/10 px-2.5 text-xs text-amber-100 hover:bg-amber-300/16 sm:min-h-8 sm:h-8",
                agentOpsActionMinWidth.cancel,
              )}
              onClick={onCancel}
              disabled={action === "cancel"}
              loading={action === "cancel"}
              loadingLabel="Cancelling…"
            >
              {action !== "cancel" ? <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
              Cancel
            </AgentOpsActionButton>
          ) : null}

          {showRetry ? (
            <AgentOpsActionButton
              type="button"
              intent="tertiary"
              size="sm"
              className={cn("min-h-10 px-2.5 text-xs sm:min-h-8 sm:h-8", agentOpsActionMinWidth.refresh)}
              onClick={onRetry}
              disabled={action === "retry"}
              loading={action === "retry"}
              loadingLabel="Retrying…"
            >
              {action !== "retry" ? <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
              Retry
            </AgentOpsActionButton>
          ) : null}
        </div>
      </div>

      {isReview ? (
        <div
          className="rounded-lg border border-amber-300/18 bg-amber-300/[0.06] p-2.5"
          role="group"
          aria-label="Run approval"
        >
          <label htmlFor={BRANCH_INPUT_ID} className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
            Promotion branch
          </label>
          <div className="mt-1.5 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              id={BRANCH_INPUT_ID}
              className="h-9 min-w-0 flex-1 font-mono text-xs sm:text-sm"
              value={approveBranch}
              title={approveBranch || "Branch name for promotion"}
              disabled={action === "approve" || action === "reject"}
              onChange={(event) => onApproveBranchChange(event.target.value)}
              placeholder="branch-name"
            />
            <div className="flex w-full min-w-0 gap-1.5 sm:w-auto">
              <AgentOpsActionButton
                type="button"
                intent="primary"
                size="sm"
                className={cn("h-9 min-w-0 flex-1 sm:flex-none", agentOpsActionMinWidth.approve)}
                onClick={onApprove}
                disabled={action === "approve" || action === "reject"}
                disabledReason={approveRunDisabledReason({ busy: action === "approve" })}
                loading={action === "approve"}
                loadingLabel="Approving…"
              >
                {action !== "approve" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
                {AGENT_OPS_ACTION_LABEL.approve}
              </AgentOpsActionButton>
              <AgentOpsActionButton
                type="button"
                intent="secondary"
                size="sm"
                className={cn("h-9 min-w-0 flex-1 sm:flex-none", agentOpsActionMinWidth.reject)}
                onClick={onReject}
                disabled={action === "reject" || action === "approve"}
                disabledReason={action === "approve" ? "Approval in progress." : null}
                loading={action === "reject"}
                loadingLabel="Rejecting…"
              >
                {action !== "reject" ? <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
                Reject
              </AgentOpsActionButton>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <span
      aria-label={statusAriaLabel(label, value)}
      className="inline-flex max-w-[9rem] min-w-0 items-center gap-1 rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-white/55"
      title={`${label}: ${value}`}
    >
      <span className="shrink-0 uppercase tracking-[0.08em] text-white/32">{label}</span>
      <span className="truncate font-medium text-white/78">{value}</span>
    </span>
  );
}

