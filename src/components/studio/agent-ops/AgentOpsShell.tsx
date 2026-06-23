import type { ReactNode } from "react";

import {
  agentOpsStudioChromeClass,
  agentOpsStudioEmbedClass,
  agentOpsStudioPanelClass,
} from "@/components/studio/agent-ops/shared/agentOpsLayout";
import { AgentOpsOperationStrip } from "@/components/studio/agent-ops/shared/AgentOpsOperationStrip";
import { LaymanCompressionDebugSurface } from "@/components/studio/agent-ops/shared/LaymanCompressionDebugSurface";
import { PrimaryWorkspaceStatus } from "@/components/studio/agent-ops/PrimaryWorkspaceStatus";
import type { AgentOpsWorkspaceTab } from "@/components/studio/agent-ops/types";
import { WorkspaceModeSwitch } from "@/components/studio/agent-ops/WorkspaceModeSwitch";
import type { AgentOpsOperationDescriptor } from "@/lib/agentOpsOperations";
import { cn } from "@/lib/utils";

export type { AgentOpsWorkspaceTab } from "@/components/studio/agent-ops/types";

type AgentOpsShellProps = {
  workspaceTab: AgentOpsWorkspaceTab;
  onWorkspaceTabChange: (tab: AgentOpsWorkspaceTab) => void;
  activeRunCount: number;
  pendingReview: number;
  proactiveReadyCount: number;
  proactiveTarget: number;
  operation?: AgentOpsOperationDescriptor | null;
  children: ReactNode;
};

export function AgentOpsShell({
  workspaceTab,
  onWorkspaceTabChange,
  activeRunCount,
  pendingReview,
  proactiveReadyCount,
  proactiveTarget,
  operation = null,
  children,
}: AgentOpsShellProps) {
  return (
    <div className={cn(agentOpsStudioEmbedClass, "relative z-10 isolate")}>
      <header className={agentOpsStudioChromeClass}>
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          <div className="min-w-0 w-full flex-1 lg:max-w-md">
            <WorkspaceModeSwitch
              value={workspaceTab}
              onChange={onWorkspaceTabChange}
              pendingReview={pendingReview}
              activeRunCount={activeRunCount}
              proactiveReadyCount={proactiveReadyCount}
            />
          </div>

          <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end sm:gap-3">
            <PrimaryWorkspaceStatus
              workspaceTab={workspaceTab}
              activeRunCount={activeRunCount}
              pendingReview={pendingReview}
              proactiveReadyCount={proactiveReadyCount}
              proactiveTarget={proactiveTarget}
            />
            <AgentOpsOperationStrip operation={operation} className="min-w-0 w-full sm:w-auto sm:text-right" />
          </div>
        </div>
        <div className="mt-2">
          <LaymanCompressionDebugSurface />
        </div>
      </header>

      <div
        id={`agent-ops-panel-${workspaceTab}`}
        role="tabpanel"
        aria-labelledby={`agent-ops-tab-${workspaceTab}`}
        tabIndex={-1}
        className={cn(agentOpsStudioPanelClass, "mt-3")}
      >
        {children}
      </div>
    </div>
  );
}
