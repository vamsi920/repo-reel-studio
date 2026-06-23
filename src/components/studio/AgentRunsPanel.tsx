import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AgentOpsShell, type AgentOpsWorkspaceTab } from "@/components/studio/agent-ops/AgentOpsShell";
import { AgentRunsPanelProactiveLane } from "@/components/studio/agent-ops/panel/AgentRunsPanelProactiveLane";
import { AgentRunsPanelRunsLane } from "@/components/studio/agent-ops/panel/AgentRunsPanelRunsLane";
import type { AgentRunsPanelProps } from "@/components/studio/agent-ops/panel/types";
import { useAgentRunsLane } from "@/components/studio/agent-ops/panel/useAgentRunsLane";
import { useAgentRunsPolling } from "@/components/studio/agent-ops/panel/useAgentRunsPolling";
import { normalizeRunDetailTab, type RunDetailTab } from "@/components/studio/agent-ops/runs/runInspectorTabs";
import { useAgentOpsProactive } from "@/components/studio/agent-ops/useAgentOpsProactive";
import { resolveProactiveOperation, resolveRunsOperation } from "@/lib/agentOpsOperations";
import {
  resolveAgentBackendAttention,
  resolveProactiveBackendAttention,
  type AgentOpsAttention,
} from "@/lib/agentOpsAttention";
import { normalizeIngestionHealth } from "@/lib/agentOpsHealth";
import { fetchIngestionHealth } from "@/lib/agentRuns";
import { buildProactiveContextHints } from "@/lib/proactiveContextHints";

export type { AgentRunsPanelProps } from "@/components/studio/agent-ops/panel/types";

export default function AgentRunsPanel({
  repoUrl,
  repoName,
  projectId,
  manifest,
  graphData,
  onFocusFile,
}: AgentRunsPanelProps) {
  const [activeTab, setActiveTabState] = useState<RunDetailTab>("summary");
  const [workspaceTab, setWorkspaceTab] = useState<AgentOpsWorkspaceTab>("runs");

  const setActiveTab = useCallback((tab: RunDetailTab) => {
    setActiveTabState(normalizeRunDetailTab(tab));
  }, []);

  const proactiveHealthRef = useRef<(fromHealth: AgentOpsAttention | null) => void>(() => {});

  const runs = useAgentRunsLane({
    repoUrl,
    repoName,
    projectId,
    manifest,
    graphData,
    onProactiveHealthAttention: (attention) => proactiveHealthRef.current(attention),
  });

  const proactive = useAgentOpsProactive({
    repoUrl,
    projectId,
    repoName,
    contextHints: useMemo(
      () => buildProactiveContextHints(manifest, graphData),
      [manifest, graphData],
    ),
    runs: runs.runs,
    selectedRunId: runs.selectedId,
    setRuns: runs.setRuns,
    setSelectedRunId: runs.setSelectedId,
    setWorkspaceTab,
    setActiveTab,
    loadRuns: runs.loadRuns,
  });

  proactiveHealthRef.current = proactive.applyProactiveHealthAttention;

  const loadProactiveRef = useRef(proactive.loadProactive);
  loadProactiveRef.current = proactive.loadProactive;

  const proactiveBackendDownRef = useRef(false);
  proactiveBackendDownRef.current = Boolean(proactive.proactiveBackendAttention);

  useAgentRunsPolling({
    repoUrl,
    workspaceTab,
    selectedIdRef: runs.selectedIdRef,
    runsWorkActiveRef: runs.runsWorkActiveRef,
    runsPollFailuresRef: runs.runsPollFailuresRef,
    loadRunsRef: runs.loadRunsRef,
    proactiveStatusRef: proactive.proactiveStatusRef,
    proactiveActionRef: proactive.proactiveActionRef,
    proactivePollFailuresRef: proactive.proactivePollFailuresRef,
    proactiveBackendDownRef,
    loadProactiveRef,
  });

  useEffect(() => {
    if (workspaceTab !== "proactive") return;
    let cancelled = false;
    const probe = async () => {
      const raw = await fetchIngestionHealth();
      if (cancelled) return;
      const normalized = normalizeIngestionHealth(raw);
      runs.setAgentBackendAttention(resolveAgentBackendAttention(normalized));
      proactive.applyProactiveHealthAttention(resolveProactiveBackendAttention(normalized));
    };
    void probe();
    return () => {
      cancelled = true;
    };
  }, [proactive.applyProactiveHealthAttention, runs.setAgentBackendAttention, workspaceTab]);

  const handleStartRun = useCallback(() => {
    void (async () => {
      const started = await runs.startRun();
      if (started) {
        setActiveTab("summary");
        setWorkspaceTab("runs");
      }
    })();
  }, [runs.startRun]);

  const handleRefreshProactive = useCallback(() => {
    void proactive.loadProactive({ manual: true });
  }, [proactive.loadProactive]);

  const handleEnableProactive = useCallback(() => {
    void proactive.toggleProactive(true);
  }, [proactive.toggleProactive]);

  const proactiveCandidates = useMemo(
    () => (proactive.proactiveStatus?.candidates ?? []).slice(0, 6),
    [proactive.proactiveStatus?.candidates],
  );

  const runsPollingActive = runs.activeRunCount > 0;

  const workspaceOperation = useMemo(() => {
    if (workspaceTab === "runs") {
      return resolveRunsOperation({
        loadingRuns: runs.loadingRuns,
        syncingRuns: runs.syncingRuns,
        refreshing: runs.refreshing,
        submitting: runs.submitting,
        action: runs.action,
        pollingActive: runsPollingActive,
      });
    }
    return resolveProactiveOperation({
      loading: proactive.proactiveLoading,
      syncing: proactive.proactiveSyncing,
      action: proactive.proactiveAction,
    });
  }, [
    runs.action,
    runs.loadingRuns,
    runs.refreshing,
    runs.submitting,
    runs.syncingRuns,
    proactive.proactiveAction,
    proactive.proactiveLoading,
    proactive.proactiveSyncing,
    runsPollingActive,
    workspaceTab,
  ]);

  return (
    <AgentOpsShell
      workspaceTab={workspaceTab}
      onWorkspaceTabChange={setWorkspaceTab}
      activeRunCount={runs.activeRunCount}
      pendingReview={runs.pendingReview}
      proactiveReadyCount={proactive.proactiveReadyCount}
      proactiveTarget={proactive.proactiveTarget}
      operation={workspaceOperation}
    >
      {workspaceTab === "runs" ? (
        <AgentRunsPanelRunsLane
          issueUrl={runs.issueUrl}
          branch={runs.branch}
          submitting={runs.submitting}
          error={runs.error}
          agentBackendAttention={runs.agentBackendAttention}
          isGitHub={runs.isGitHub}
          runCount={runs.runs.length}
          pendingReview={runs.pendingReview}
          inputRef={runs.inputRef}
          onIssueUrlChange={runs.handleIssueUrlChange}
          onBranchChange={runs.setBranch}
          onStartRun={handleStartRun}
          runs={runs.runs}
          filteredRuns={runs.filteredRuns}
          runFilter={runs.runFilter}
          selectedId={runs.selectedId}
          loadingRuns={runs.loadingRuns}
          syncingRuns={runs.syncingRuns}
          onRunFilterChange={runs.setRunFilter}
          onSelectRun={runs.setSelectedId}
          onRefreshRuns={runs.handleRefreshRuns}
          onFocusComposer={runs.focusComposer}
          selected={runs.selected}
          selectedRunView={runs.selectedRunView}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          action={runs.action}
          refreshing={runs.refreshing}
          approveBranch={runs.approveBranch}
          onApproveBranchChange={runs.setApproveBranch}
          onRefreshSelected={() => void runs.refreshSelected()}
          onCancel={() => void runs.cancel()}
          onRetry={() => void runs.retry()}
          onApprove={() => void runs.approve()}
          onReject={() => void runs.reject()}
          onFocusFile={onFocusFile}
        />
      ) : (
        <AgentRunsPanelProactiveLane
          proactive={proactive}
          proactiveCandidates={proactiveCandidates}
          selectedRunId={runs.selectedId}
          onRefresh={handleRefreshProactive}
          onEnableProactive={handleEnableProactive}
        />
      )}
    </AgentOpsShell>
  );
}
