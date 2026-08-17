import { RunInspectorDetail } from "@/components/studio/agent-ops/panel/RunInspectorDetail";
import { RunsInspectorEmpty } from "@/components/studio/agent-ops/runs/RunsInspectorEmpty";
import type { RunDetailTab } from "@/components/studio/agent-ops/runs/runInspectorTabs";
import type { SelectedRunView } from "@/components/studio/agent-ops/panel/types";
import type { AgentRun } from "@/lib/agentRuns";

export type AgentRunsPanelRunsLaneInspectorProps = {
  selected: AgentRun | null;
  selectedRunView: SelectedRunView | null;
  activeTab: RunDetailTab;
  onTabChange: (tab: RunDetailTab) => void;
  action: "approve" | "reject" | "cancel" | "retry" | null;
  refreshing: boolean;
  approveBranch: string;
  onApproveBranchChange: (value: string) => void;
  onRefreshSelected: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onApprove: () => void;
  onReject: () => void;
  onFocusFile?: (filePath: string) => void;
  onFocusComposer: () => void;
};

export function AgentRunsPanelRunsLaneInspector({
  selected,
  selectedRunView,
  activeTab,
  onTabChange,
  action,
  refreshing,
  approveBranch,
  onApproveBranchChange,
  onRefreshSelected,
  onCancel,
  onRetry,
  onApprove,
  onReject,
  onFocusFile,
  onFocusComposer,
}: AgentRunsPanelRunsLaneInspectorProps) {
  if (!selected || !selectedRunView) {
    return <RunsInspectorEmpty onStartRun={onFocusComposer} />;
  }

  return (
    <RunInspectorDetail
      run={selected}
      activeTab={activeTab}
      onTabChange={onTabChange}
      selectedRunView={selectedRunView}
      action={action}
      refreshing={refreshing}
      approveBranch={approveBranch}
      onApproveBranchChange={onApproveBranchChange}
      onRefresh={onRefreshSelected}
      onCancel={onCancel}
      onRetry={onRetry}
      onApprove={onApprove}
      onReject={onReject}
      onFocusFile={onFocusFile}
    />
  );
}
