import { ProactiveCandidateCardList } from "@/components/studio/agent-ops/proactive/ProactiveCandidateCardList";
import { ProactiveCandidateDetail } from "@/components/studio/agent-ops/proactive/ProactiveCandidateDetail";
import { ProactiveDashboard } from "@/components/studio/agent-ops/proactive/ProactiveDashboard";
import { ProactiveModeCard } from "@/components/studio/agent-ops/proactive/ProactiveModeCard";
import { ProactiveWorkspace } from "@/components/studio/agent-ops/proactive/ProactiveWorkspace";
import type { useAgentOpsProactive } from "@/components/studio/agent-ops/useAgentOpsProactive";
import type { ProactiveCandidate } from "@/lib/proactiveAgentOps";
type ProactiveController = ReturnType<typeof useAgentOpsProactive>;

export type AgentRunsPanelProactiveLaneProps = {
  proactive: ProactiveController;
  proactiveCandidates: ProactiveCandidate[];
  selectedRunId: string | null;
  onRefresh: () => void;
  onEnableProactive: () => void;
};

export function AgentRunsPanelProactiveLane({
  proactive,
  proactiveCandidates,
  selectedRunId,
  onRefresh,
  onEnableProactive,
}: AgentRunsPanelProactiveLaneProps) {
  return (
    <ProactiveWorkspace
      controlRail={
        <ProactiveModeCard
          status={proactive.proactiveStatus}
          loading={proactive.proactiveLoading}
          syncing={proactive.proactiveSyncing}
          action={proactive.proactiveAction}
          attention={proactive.proactiveBackendAttention}
          onRefresh={onRefresh}
          onToggle={proactive.toggleProactive}
          onDispatch={proactive.dispatchProactive}
        />
      }
      dashboard={
        <ProactiveDashboard
          status={proactive.proactiveStatus}
          loading={proactive.proactiveLoading}
          syncing={proactive.proactiveSyncing}
          action={proactive.proactiveAction}
          attention={proactive.proactiveBackendAttention}
          onRefresh={onRefresh}
          onDispatch={proactive.dispatchProactive}
          onEnableProactive={onEnableProactive}
          candidateList={
            <ProactiveCandidateCardList
              candidates={proactiveCandidates}
              selectedRunId={selectedRunId}
              selectedCandidateId={proactive.selectedProactiveId}
              action={proactive.proactiveAction}
              onSelectCandidate={proactive.setSelectedProactiveId}
              onApprove={proactive.approveCandidate}
              onDismiss={proactive.dismissCandidate}
              onSelectRun={proactive.selectCandidateRun}
            />
          }
        />
      }
      inspection={
        <ProactiveCandidateDetail
          candidate={proactive.selectedProactiveCandidate}
          batch={proactive.proactiveStatus?.batch ?? null}
          onSelectRun={proactive.selectCandidateRun}
          onRefresh={onRefresh}
        />
      }
    />
  );
}
