import { ScrollArea } from "@/components/ui/scroll-area";
import type { AgentRun } from "@/lib/agentRuns";
import { cn } from "@/lib/utils";
import { MissionMap } from "@/components/studio/MissionMap";
import { RunInspectorHeader } from "@/components/studio/agent-ops/runs/RunInspectorHeader";
import { RunInspectorProgress } from "@/components/studio/agent-ops/runs/RunInspectorProgress";
import { RunInspectorTabBar } from "@/components/studio/agent-ops/runs/RunInspectorTabBar";
import { RunInspectorFactStrip } from "@/components/studio/agent-ops/runs/RunInspectorFactStrip";
import { RunChecksTab } from "@/components/studio/agent-ops/runs/RunChecksTab";
import { RunShipTab } from "@/components/studio/agent-ops/runs/RunShipTab";
import { RunPatchTab } from "@/components/studio/agent-ops/runs/RunPatchTab";
import { RunSummaryTab } from "@/components/studio/agent-ops/runs/RunSummaryTab";
import { runDetailPanelId, runDetailTabId, type RunDetailTab } from "@/components/studio/agent-ops/runs/runInspectorTabs";
import type { SelectedRunView } from "@/components/studio/agent-ops/panel/types";
import { agentOpsInspectorPanelClass } from "@/components/studio/agent-ops/shared/agentOpsDimensions";
import { agentOpsInspectorShellClass } from "@/components/studio/agent-ops/shared/agentOpsLayout";

export type RunInspectorDetailProps = {
  run: AgentRun;
  activeTab: RunDetailTab;
  onTabChange: (tab: RunDetailTab) => void;
  selectedRunView: SelectedRunView;
  action: "approve" | "reject" | "cancel" | "retry" | null;
  refreshing: boolean;
  approveBranch: string;
  onApproveBranchChange: (value: string) => void;
  onRefresh: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onApprove: () => void;
  onReject: () => void;
  onFocusFile?: (filePath: string) => void;
};

export function RunInspectorDetail({
  run,
  activeTab,
  onTabChange,
  selectedRunView,
  action,
  refreshing,
  approveBranch,
  onApproveBranchChange,
  onRefresh,
  onCancel,
  onRetry,
  onApprove,
  onReject,
  onFocusFile,
}: RunInspectorDetailProps) {
  return (
    <div className={cn(agentOpsInspectorShellClass, agentOpsInspectorPanelClass)}>
      <RunInspectorHeader
        run={run}
        isActive={selectedRunView.isActive}
        isReview={selectedRunView.isReview}
        isFailed={selectedRunView.isFailed}
        action={action}
        refreshing={refreshing}
        approveBranch={approveBranch}
        onApproveBranchChange={onApproveBranchChange}
        onRefresh={onRefresh}
        onCancel={onCancel}
        onRetry={onRetry}
        onApprove={onApprove}
        onReject={onReject}
      />

      <RunInspectorFactStrip run={run} isReview={selectedRunView.isReview} onOpenTab={onTabChange} />

      <div className="border-b border-border bg-muted/40 px-4 py-2.5 sm:px-5">
        <RunInspectorProgress
          phaseIndex={selectedRunView.phaseIndex}
          isActive={selectedRunView.isActive}
          isFailed={selectedRunView.isFailed}
          status={run.status}
          latestTitle={selectedRunView.latestTitle ?? undefined}
          artifacts={run.artifacts}
          compact
        />
      </div>

      <RunInspectorTabBar activeTab={activeTab} onTabChange={onTabChange} />

      <div
        id={runDetailPanelId(activeTab)}
        role="tabpanel"
        aria-labelledby={runDetailTabId(activeTab)}
        className="min-h-[12rem] px-4 py-4 sm:px-5 sm:py-5"
      >
        {activeTab === "map" && (
          <ScrollArea className="h-[min(28rem,70vh)] sm:h-[600px]">
            <MissionMap run={run} />
          </ScrollArea>
        )}

        {activeTab === "summary" && <RunSummaryTab run={run} onFocusFile={onFocusFile} />}

        {activeTab === "patch" && (
          <RunPatchTab
            diffStat={run.artifacts.diffStat ?? ""}
            patch={run.artifacts.patch ?? ""}
            isRunActive={selectedRunView.isActive}
            onOpenSummary={() => onTabChange("summary")}
          />
        )}

        {activeTab === "checks" && <RunChecksTab run={run} onRefreshRun={onRefresh} />}

        {activeTab === "ship" && (
          <RunShipTab
            run={run}
            isRunActive={selectedRunView.isActive}
            isReview={selectedRunView.isReview}
            onRefreshRun={onRefresh}
            onOpenSummary={() => onTabChange("summary")}
          />
        )}
      </div>
    </div>
  );
}
