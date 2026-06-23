import type { ReactNode } from "react";

import { AgentOpsPanel } from "@/components/studio/agent-ops/shared/AgentOpsPanel";
import type { AgentOpsAttention } from "@/lib/agentOpsAttention";
import type { ProactiveStatus } from "@/lib/proactiveAgentOps";

import { ProactiveDashboardEmpty } from "./ProactiveDashboardEmpty";
import { ProactiveDashboardHeader } from "./ProactiveDashboardHeader";

export type ProactiveDashboardProps = {
  status: ProactiveStatus | null;
  loading: boolean;
  syncing: boolean;
  action: string | null;
  attention: AgentOpsAttention | null;
  onRefresh: () => void;
  onDispatch: () => void;
  onEnableProactive: () => void;
  candidateList: ReactNode;
};

export function ProactiveDashboard({
  status,
  loading,
  syncing,
  action,
  attention,
  onRefresh,
  onDispatch,
  onEnableProactive,
  candidateList,
}: ProactiveDashboardProps) {
  const candidates = (status?.candidates ?? []).slice(0, 6);
  const enabled = status?.config.enabled ?? false;
  const showEmpty = candidates.length === 0;

  return (
    <AgentOpsPanel variant="nested" className="min-w-0 max-w-full">
      <ProactiveDashboardHeader
        status={status}
        loading={loading}
        syncing={syncing}
        action={action}
        attention={attention}
        onRefresh={onRefresh}
        onDispatch={onDispatch}
      />

      <div className="px-4 py-4">
        {showEmpty ? (
          <ProactiveDashboardEmpty
            loading={loading && !status}
            enabled={enabled}
            attention={attention}
            onEnableProactive={onEnableProactive}
            onDispatch={onDispatch}
          />
        ) : (
          candidateList
        )}
      </div>
    </AgentOpsPanel>
  );
}
