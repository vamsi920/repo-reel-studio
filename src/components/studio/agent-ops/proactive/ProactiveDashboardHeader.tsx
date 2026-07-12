import type { ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { AgentOpsAttentionPanel } from "@/components/studio/agent-ops/shared/AgentOpsAttentionPanel";
import { AgentOpsMetricCell } from "@/components/studio/agent-ops/shared/AgentOpsMetricCell";
import { statusAriaLabel } from "@/components/studio/agent-ops/shared/agentOpsA11y";
import {
  formatBatchStatusLabel,
  proactiveShortfallReason,
} from "@/components/studio/agent-ops/shared/proactiveHints";
import {
  AGENT_OPS_ACTION_LABEL,
  refreshDisabledReason,
} from "@/components/studio/agent-ops/shared/agentOpsActions";
import { AgentOpsActionButton } from "@/components/studio/agent-ops/shared/AgentOpsActionButton";
import { agentOpsActionMinWidth } from "@/components/studio/agent-ops/shared/agentOpsDimensions";
import type { AgentOpsAttention } from "@/lib/agentOpsAttention";
import type { ProactiveStatus } from "@/lib/proactiveAgentOps";
import { cn } from "@/lib/utils";

export type ProactiveDashboardHeaderProps = {
  status: ProactiveStatus | null;
  loading: boolean;
  syncing: boolean;
  action: string | null;
  attention: AgentOpsAttention | null;
  onRefresh: () => void;
  onDispatch: () => void;
};

export function ProactiveDashboardHeader({
  status,
  loading,
  syncing,
  action,
  attention,
  onRefresh,
}: ProactiveDashboardHeaderProps) {
  const enabled = status?.config.enabled ?? false;
  const target = status?.target ?? status?.config.targetCount ?? 6;
  const ready = status?.ready ?? 0;
  const progress = status?.batch?.progress;
  const batch = status?.batch;
  const shortfall = proactiveShortfallReason(status);
  const dispatching = action === "dispatch";
  const refreshBusy = loading || syncing;
  const controlsLocked = dispatching;
  const metricsPending = loading && !status;

  const metricValue = (value: string) =>
    metricsPending ? (
      <span className="text-muted-foreground" aria-hidden>
        …
      </span>
    ) : (
      value
    );

  return (
    <div className="border-b border-border px-4 py-3 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Candidates</h2>
          <StatusChip tone={enabled ? "on" : "off"} label={enabled ? "Enabled" : "Paused"}>
            {enabled ? "Enabled" : "Paused"}
          </StatusChip>
        </div>

        <AgentOpsActionButton
          type="button"
          intent="tertiary"
          size="sm"
          className={cn(
            "h-8 w-full shrink-0 text-xs sm:w-auto",
            agentOpsActionMinWidth.refreshWide,
          )}
          onClick={onRefresh}
          disabled={(loading && !dispatching) || controlsLocked}
          disabledReason={refreshDisabledReason({
            busy: refreshBusy,
            controlsLocked,
            scope: "candidates",
          })}
          loading={refreshBusy}
          loadingLabel={syncing && !loading ? "Syncing…" : "Loading…"}
        >
          {!refreshBusy ? <RefreshCw className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
          {AGENT_OPS_ACTION_LABEL.refresh}
        </AgentOpsActionButton>
      </div>

      <div className="mt-3 flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1 text-xs tabular-nums text-muted-foreground">
        <span>
          <span className="text-muted-foreground">Ready </span>
          <span className={cn("font-semibold text-foreground", ready > 0 && "text-emerald-700")}>
            {metricValue(`${ready}/${target}`)}
          </span>
        </span>
        <span>
          <span className="text-muted-foreground">Batch </span>
          <span className="font-medium text-foreground/80">{metricValue(formatBatchStatusLabel(batch, loading))}</span>
        </span>
        <span>
          <span className="text-muted-foreground">Passed </span>
          <span className="font-medium text-foreground/80">{metricValue(`${progress?.ready ?? 0}`)}</span>
        </span>
      </div>

      {progress ? (
        <details className="mt-2 text-[11px] text-muted-foreground">
          <summary className="cursor-pointer list-none font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
            Batch breakdown
          </summary>
          <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <AgentOpsMetricCell label="Discovered" value={metricValue(`${progress.discovered ?? 0}`)} />
            <AgentOpsMetricCell label="Dismissed" value={metricValue(`${progress.dismissed ?? 0}`)} />
            <AgentOpsMetricCell
              label="Materialized"
              value={metricValue(`${progress.materialized ?? 0}`)}
              className="col-span-2 sm:col-span-1"
            />
          </dl>
        </details>
      ) : null}

      {attention ? <AgentOpsAttentionPanel attention={attention} className="mt-3" /> : null}
      {!attention && shortfall ? (
        <AlertRow tone="warn" icon>
          {shortfall}
        </AlertRow>
      ) : null}
    </div>
  );
}

function StatusChip({
  children,
  tone,
  label,
}: {
  children: ReactNode;
  tone: "on" | "off" | "neutral";
  label: string;
}) {
  return (
    <span
      aria-label={statusAriaLabel("Proactive", label)}
      className={cn(
        "rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]",
        tone === "on" && "border-emerald-300/25 bg-emerald-300/10 text-emerald-700",
        tone === "off" && "border-border bg-muted text-muted-foreground",
        tone === "neutral" && "border-border bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function AlertRow({
  children,
  tone,
  icon,
}: {
  children: ReactNode;
  tone: "warn";
  icon?: boolean;
}) {
  return (
    <div
      className={cn(
        "mt-3 flex gap-2 rounded-md border px-2.5 py-2 text-xs leading-5",
        tone === "warn" && "border-amber-300/20 bg-amber-300/10 text-amber-50/88",
      )}
      role="alert"
    >
      {icon ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
      <span>{children}</span>
    </div>
  );
}
