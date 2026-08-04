import type { RefObject } from "react";

import {
  AgentRunsPanelRunsLaneInspector,
  type AgentRunsPanelRunsLaneInspectorProps,
} from "@/components/studio/agent-ops/panel/AgentRunsPanelRunsLaneInspector";
import { IssueRunComposer } from "@/components/studio/agent-ops/runs/IssueRunComposer";
import { RunQueuePanel } from "@/components/studio/agent-ops/runs/RunQueuePanel";
import { RunsWorkspace } from "@/components/studio/agent-ops/runs/RunsWorkspace";
import type { RunDetailTab } from "@/components/studio/agent-ops/runs/runInspectorTabs";
import type { SelectedRunView } from "@/components/studio/agent-ops/panel/types";
import type { AgentRun } from "@/lib/agentRuns";
import type { AgentOpsAttention } from "@/lib/agentOpsAttention";

export type AgentRunsPanelRunsLaneProps = AgentRunsPanelRunsLaneInspectorProps & {
  issueUrl: string;
  branch: string;
  submitting: boolean;
  error: string | null;
  agentBackendAttention: AgentOpsAttention | null;
  isGitHub: boolean;
  runCount: number;
  pendingReview: number;
  inputRef: RefObject<HTMLInputElement | null>;
  onIssueUrlChange: (value: string) => void;
  onBranchChange: (value: string) => void;
  onStartRun: () => void;
  runs: AgentRun[];
  filteredRuns: AgentRun[];
  runFilter: string;
  selectedId: string | null;
  loadingRuns: boolean;
  syncingRuns: boolean;
  onRunFilterChange: (value: string) => void;
  onSelectRun: (runId: string) => void;
  onRefreshRuns: () => void;
};

export function AgentRunsPanelRunsLane(props: AgentRunsPanelRunsLaneProps) {
  const {
    issueUrl,
    branch,
    submitting,
    error,
    agentBackendAttention,
    isGitHub,
    runCount,
    pendingReview,
    inputRef,
    onIssueUrlChange,
    onBranchChange,
    onStartRun,
    runs,
    filteredRuns,
    runFilter,
    selectedId,
    loadingRuns,
    syncingRuns,
    onRunFilterChange,
    onSelectRun,
    onRefreshRuns,
    onFocusComposer,
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
  } = props;

  return (
    <RunsWorkspace
      composer={
        <IssueRunComposer
          issueUrl={issueUrl}
          branch={branch}
          submitting={submitting}
          error={error}
          agentBackendAttention={agentBackendAttention}
          isGitHub={isGitHub}
          runCount={runCount}
          pendingReview={pendingReview}
          inputRef={inputRef}
          onIssueUrlChange={onIssueUrlChange}
          onBranchChange={onBranchChange}
          onStartRun={onStartRun}
        />
      }
      queue={
        <RunQueuePanel
          runs={runs}
          filteredRuns={filteredRuns}
          runFilter={runFilter}
          selectedId={selectedId}
          loadingRuns={loadingRuns}
          syncingRuns={syncingRuns}
          onRunFilterChange={onRunFilterChange}
          onSelectRun={onSelectRun}
          onRefresh={onRefreshRuns}
          onStartRun={onFocusComposer}
        />
      }
      inspector={
        <AgentRunsPanelRunsLaneInspector
          selected={selected}
          selectedRunView={selectedRunView}
          activeTab={activeTab}
          onTabChange={onTabChange}
          action={action}
          refreshing={refreshing}
          approveBranch={approveBranch}
          onApproveBranchChange={onApproveBranchChange}
          onRefreshSelected={onRefreshSelected}
          onCancel={onCancel}
          onRetry={onRetry}
          onApprove={onApprove}
          onReject={onReject}
          onFocusFile={onFocusFile}
          onFocusComposer={onFocusComposer}
        />
      }
    />
  );
}
