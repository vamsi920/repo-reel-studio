import type { ReactNode } from "react";

import {
  agentOpsStudioChromeClass,
  agentOpsStudioEmbedClass,
  agentOpsStudioPanelClass,
} from "@/components/studio/agent-ops/shared/agentOpsLayout";
import { AgentOpsOperationStrip } from "@/components/studio/agent-ops/shared/AgentOpsOperationStrip";
import { AgentOpsAttentionPanel } from "@/components/studio/agent-ops/shared/AgentOpsAttentionPanel";
import { LaymanCompressionDebugSurface } from "@/components/studio/agent-ops/shared/LaymanCompressionDebugSurface";
import type { AgentOpsWorkspaceTab } from "@/components/studio/agent-ops/types";
import { WorkspaceModeSwitch } from "@/components/studio/agent-ops/WorkspaceModeSwitch";
import type { AgentOpsAttention } from "@/lib/agentOpsAttention";
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
  attention?: AgentOpsAttention | null;
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
  attention = null,
  operation = null,
  children,
}: AgentOpsShellProps) {
  return (
    <div className={cn(agentOpsStudioEmbedClass, "relative z-10 isolate")}>
      <header className={agentOpsStudioChromeClass}>
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground">
              {workspaceTab === "runs" ? "Agent runs" : "Proactive review"}
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              {workspaceTab === "runs"
                ? "Give an agent a GitHub issue, follow its progress, inspect the patch and checks, then approve promotion."
                : "Review repository findings before they become agent runs. Nothing opens a PR without approval."}
            </p>
          </div>

          <div className="min-w-0 w-full lg:w-[22rem]">
            <WorkspaceModeSwitch
              value={workspaceTab}
              onChange={onWorkspaceTabChange}
              pendingReview={pendingReview}
              activeRunCount={activeRunCount}
              proactiveReadyCount={proactiveReadyCount}
            />
          </div>

        </div>

        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 border-t border-border/70 pt-3">
          {workspaceTab === "runs" ? (
            <>
              <StatusChip label="Active" value={activeRunCount} tone={activeRunCount > 0 ? "active" : "idle"} />
              <StatusChip label="Needs review" value={pendingReview} tone={pendingReview > 0 ? "attention" : "idle"} />
              <span className="text-[11px] text-muted-foreground">Sandboxed until you approve</span>
            </>
          ) : (
            <>
              <StatusChip label="Ready" value={proactiveReadyCount} tone={proactiveReadyCount > 0 ? "ready" : "idle"} />
              <span className="text-[11px] tabular-nums text-muted-foreground">Target {proactiveTarget}</span>
              <span className="text-[11px] text-muted-foreground">Internal review only</span>
            </>
          )}
          <AgentOpsOperationStrip operation={operation} className="ml-auto min-w-0 text-right" />
        </div>

        <AgentOpsAttentionPanel attention={attention} className="mt-3" />

        <div className="mt-3">
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

function StatusChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "idle" | "active" | "attention" | "ready";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium",
        tone === "idle" && "bg-muted text-muted-foreground",
        tone === "active" && "bg-sky-50 text-sky-700",
        tone === "attention" && "bg-amber-50 text-amber-700",
        tone === "ready" && "bg-emerald-50 text-emerald-700",
      )}
    >
      <span className="tabular-nums font-semibold">{value}</span>
      {label}
    </span>
  );
}
