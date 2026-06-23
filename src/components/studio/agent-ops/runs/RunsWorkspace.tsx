import type { ReactNode } from "react";

import { AgentOpsSplitLayout } from "@/components/studio/agent-ops/shared/AgentOpsSplitLayout";

type RunsWorkspaceProps = {
  composer: ReactNode;
  queue: ReactNode;
  inspector: ReactNode;
};

export function RunsWorkspace({ composer, queue, inspector }: RunsWorkspaceProps) {
  return (
    <AgentOpsSplitLayout
      sidebar={
        <>
          {composer}
          {queue}
        </>
      }
    >
      {inspector}
    </AgentOpsSplitLayout>
  );
}
