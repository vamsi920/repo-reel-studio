import { Clock, RefreshCw } from "lucide-react";

import { AgentOpsAttentionPanel } from "@/components/studio/agent-ops/shared/AgentOpsAttentionPanel";
import {
  AGENT_OPS_ACTION_LABEL,
  refreshDisabledReason,
  runScanDisabledReason,
} from "@/components/studio/agent-ops/shared/agentOpsActions";
import { AgentOpsActionButton } from "@/components/studio/agent-ops/shared/AgentOpsActionButton";
import { statusAriaLabel } from "@/components/studio/agent-ops/shared/agentOpsA11y";
import { AgentOpsMetricCell } from "@/components/studio/agent-ops/shared/AgentOpsMetricCell";
import { agentOpsStudioChromeClass } from "@/components/studio/agent-ops/shared/agentOpsLayout";
import { AGENT_OPS_COPY } from "@/components/studio/agent-ops/shared/agentOpsCopy";
import {
  agentOpsActionMinWidth,
  agentOpsModePillClass,
  agentOpsToggleStatusLabelClass,
} from "@/components/studio/agent-ops/shared/agentOpsDimensions";
import { proactiveDispatchLabel } from "@/components/studio/agent-ops/shared/proactiveHints";
import type { AgentOpsAttention } from "@/lib/agentOpsAttention";
import { Switch } from "@/components/ui/switch";
import type { ProactiveStatus } from "@/lib/proactiveAgentOps";
import { cn } from "@/lib/utils";

export type ProactiveModeCardProps = {
  status: ProactiveStatus | null;
  loading: boolean;
  syncing: boolean;
  action: string | null;
  attention: AgentOpsAttention | null;
  onRefresh: () => void;
  onToggle: (enabled: boolean) => void;
  onDispatch: () => void;
};

export function ProactiveModeCard({
  status,
  loading,
  syncing,
  action,
  attention,
  onRefresh,
  onToggle,
  onDispatch,
}: ProactiveModeCardProps) {
  const enabled = status?.config.enabled ?? false;
  const ready = status?.ready ?? 0;
  const target = status?.target ?? status?.config.targetCount ?? 6;
  const batch = status?.batch;
  const deadline = status?.config.morningDeadline ?? "09:00";
  const toggling = action === "toggle";
  const dispatching = action === "dispatch";
  const refreshBusy = loading || syncing;
  const controlsLocked = toggling || dispatching;

  return (
    <section className={cn(agentOpsStudioChromeClass, "min-w-0 max-w-full p-4 sm:p-5")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Proactive</h3>
          <ModeStatusPill enabled={enabled} saving={toggling} />
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{AGENT_OPS_COPY.proactiveScope}</p>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span className={agentOpsToggleStatusLabelClass} id="proactive-mode-toggle-label">
            {toggling ? "Saving…" : enabled ? "Enabled" : "Paused"}
          </span>
          <Switch
            checked={enabled}
            disabled={controlsLocked}
            aria-labelledby="proactive-mode-toggle-label"
            aria-busy={toggling}
            onCheckedChange={(checked) => onToggle(Boolean(checked))}
            className="data-[state=checked]:bg-emerald-400 data-[state=unchecked]:bg-input"
          />
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2">
        <AgentOpsMetricCell label="Today ready" value={`${ready}`} sub={`of ${target}`} emphasize={ready > 0} />
        <AgentOpsMetricCell label="Target" value={`${target}`} sub="per day" />
        <AgentOpsMetricCell label="Deadline" value={deadline} sub="daily cutoff" />
      </dl>

      <p className="mt-2 text-[11px] leading-5 text-muted-foreground" title={proactiveDispatchLabel(batch ?? null, enabled, target, deadline)}>
        {proactiveDispatchLabel(batch ?? null, enabled, target, deadline)}
      </p>

      <div className="mt-3 space-y-2">
        <AgentOpsActionButton
          type="button"
          intent="primary"
          size="sm"
          className={cn("h-9 w-full text-xs", agentOpsActionMinWidth.runScan)}
          onClick={onDispatch}
          disabled={controlsLocked}
          disabledReason={runScanDisabledReason({ dispatching, controlsLocked, enabled })}
          loading={dispatching}
          loadingLabel="Scanning…"
        >
          {!dispatching ? <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
          {AGENT_OPS_ACTION_LABEL.runScan}
        </AgentOpsActionButton>
        <AgentOpsActionButton
          type="button"
          intent="tertiary"
          size="sm"
          className={cn("h-8 w-full justify-center text-xs", agentOpsActionMinWidth.refreshWide)}
          onClick={onRefresh}
          disabled={(loading && !dispatching) || controlsLocked}
          disabledReason={refreshDisabledReason({
            busy: refreshBusy,
            controlsLocked,
            scope: "proactive",
          })}
          loading={refreshBusy}
          loadingLabel={syncing && !loading ? "Syncing…" : "Loading…"}
        >
          {!refreshBusy ? <RefreshCw className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
          {AGENT_OPS_ACTION_LABEL.refresh}
        </AgentOpsActionButton>
      </div>

      <AgentOpsAttentionPanel attention={attention} className="mt-3" />
    </section>
  );
}

function ModeStatusPill({ enabled, saving }: { enabled: boolean; saving: boolean }) {
  const label = saving ? "Updating…" : enabled ? "Enabled" : "Paused";
  return (
    <span
      role="status"
      aria-label={statusAriaLabel("Proactive mode", label)}
      className={cn(
        agentOpsModePillClass,
        saving && "border-border bg-muted text-muted-foreground",
        !saving && enabled && "border-emerald-300/25 bg-emerald-300/10 text-emerald-700",
        !saving && !enabled && "border-border bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

