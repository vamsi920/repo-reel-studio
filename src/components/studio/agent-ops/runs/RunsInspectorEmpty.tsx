import type { ReactNode } from "react";

import { AGENT_OPS_ACTION_LABEL } from "@/components/studio/agent-ops/shared/agentOpsActions";
import { AGENT_OPS_COPY } from "@/components/studio/agent-ops/shared/agentOpsCopy";
import { AgentOpsEmptyState } from "@/components/studio/agent-ops/shared/AgentOpsEmptyState";
import { agentOpsInspectorPanelClass } from "@/components/studio/agent-ops/shared/agentOpsDimensions";
import { agentOpsInspectorShellClass } from "@/components/studio/agent-ops/shared/agentOpsLayout";
import { cn } from "@/lib/utils";

export function RunsInspectorEmpty({ onStartRun }: { onStartRun: () => void }) {
  return (
    <AgentOpsPanelShell>
      <AgentOpsEmptyState
        title={AGENT_OPS_COPY.noRunSelectedTitle}
        message={AGENT_OPS_COPY.noRunSelectedMessage}
        action={{ label: AGENT_OPS_ACTION_LABEL.startRun, onClick: onStartRun, intent: "primary" }}
      />
    </AgentOpsPanelShell>
  );
}

function AgentOpsPanelShell({ children }: { children: ReactNode }) {
  return (
    <div className={cn(agentOpsInspectorShellClass, agentOpsInspectorPanelClass)}>
      <div className="px-3 py-4 sm:px-5 sm:py-5">{children}</div>
    </div>
  );
}
