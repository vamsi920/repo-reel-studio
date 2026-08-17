import type { ReactNode } from "react";

import { AgentOpsSplitLayout } from "@/components/studio/agent-ops/shared/AgentOpsSplitLayout";
import { agentOpsProactiveMainGridClass } from "@/components/studio/agent-ops/shared/agentOpsLayout";

type ProactiveWorkspaceProps = {
  controlRail: ReactNode;
  dashboard: ReactNode;
  inspection: ReactNode;
};

export function ProactiveWorkspace({ controlRail, dashboard, inspection }: ProactiveWorkspaceProps) {
  return (
    <AgentOpsSplitLayout sidebar={controlRail}>
      <div className={agentOpsProactiveMainGridClass}>
        <div className="min-w-0 max-w-full">{dashboard}</div>
        <div className="min-w-0 max-w-full md:max-w-none xl:sticky xl:top-0 xl:max-h-[min(920px,calc(100vh-10rem))] xl:overflow-x-hidden xl:overflow-y-auto">
          {inspection}
        </div>
      </div>
    </AgentOpsSplitLayout>
  );
}
