import { AGENT_OPS_ACTION_LABEL } from "@/components/studio/agent-ops/shared/agentOpsActions";
import { AgentOpsSpinner } from "@/components/studio/agent-ops/shared/AgentOpsSpinner";
import { AGENT_OPS_COPY } from "@/components/studio/agent-ops/shared/agentOpsCopy";
import { AgentOpsAttentionPanel } from "@/components/studio/agent-ops/shared/AgentOpsAttentionPanel";
import { AgentOpsEmptyState } from "@/components/studio/agent-ops/shared/AgentOpsEmptyState";
import type { AgentOpsAttention } from "@/lib/agentOpsAttention";

export type ProactiveDashboardEmptyProps = {
  loading: boolean;
  enabled: boolean;
  attention: AgentOpsAttention | null;
  onEnableProactive: () => void;
  onDispatch: () => void;
};

export function ProactiveDashboardEmpty({
  loading,
  enabled,
  attention,
  onEnableProactive,
  onDispatch,
}: ProactiveDashboardEmptyProps) {
  if (loading) {
    return (
      <AgentOpsEmptyState
        title="Loading"
        message={AGENT_OPS_COPY.loadingCandidates}
        compact
        className="items-center text-center sm:items-stretch sm:text-left"
      >
        <AgentOpsSpinner className="mx-auto h-5 w-5 text-muted-foreground sm:mx-0" />
      </AgentOpsEmptyState>
    );
  }

  if (attention) {
    return <AgentOpsAttentionPanel attention={attention} />;
  }

  if (!enabled) {
    return (
      <AgentOpsEmptyState
        title={AGENT_OPS_COPY.proactivePausedTitle}
        message={AGENT_OPS_COPY.proactivePausedMessage}
        action={{ label: "Enable proactive", onClick: onEnableProactive, intent: "primary" }}
        className="text-center sm:text-left"
      />
    );
  }

  return (
    <AgentOpsEmptyState
      title={AGENT_OPS_COPY.noCandidatesTitle}
      message={AGENT_OPS_COPY.noCandidatesMessage}
      action={{ label: AGENT_OPS_ACTION_LABEL.runScan, onClick: onDispatch, intent: "primary" }}
      className="text-center sm:text-left"
    />
  );
}
