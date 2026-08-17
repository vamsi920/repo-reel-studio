import type { ReactNode } from "react";

import {
  agentOpsSplitLayoutClass,
  agentOpsSplitMainClass,
  agentOpsSplitSidebarClass,
} from "@/components/studio/agent-ops/shared/agentOpsLayout";
import { cn } from "@/lib/utils";

type AgentOpsSplitLayoutProps = {
  sidebar: ReactNode;
  children: ReactNode;
  sidebarWidth?: "default" | "wide";
};

export function AgentOpsSplitLayout({ sidebar, children, sidebarWidth = "default" }: AgentOpsSplitLayoutProps) {
  return (
    <div
      className={cn(
        agentOpsSplitLayoutClass,
        sidebarWidth === "wide" && "xl:grid-cols-[minmax(0,min(360px,100%))_minmax(0,1fr)]",
      )}
    >
      <aside className={agentOpsSplitSidebarClass}>{sidebar}</aside>
      <div className={agentOpsSplitMainClass}>{children}</div>
    </div>
  );
}
