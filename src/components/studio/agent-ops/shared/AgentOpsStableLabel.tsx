import type { ReactNode } from "react";

import { agentOpsOperationFadeClass } from "@/components/studio/agent-ops/shared/agentOpsMotion";
import { cn } from "@/lib/utils";

type AgentOpsStableLabelProps = {
  loading?: boolean;
  loadingLabel?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Keeps button width stable when swapping default vs loading copy. */
export function AgentOpsStableLabel({ loading, loadingLabel, children, className }: AgentOpsStableLabelProps) {
  const showLoading = Boolean(loading && loadingLabel);

  return (
    <span className={cn("relative inline-grid grid-cols-1 grid-rows-1 items-center", className)}>
      <span
        className={cn(
          "col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5",
          agentOpsOperationFadeClass,
          showLoading ? "opacity-0" : "opacity-100",
        )}
        aria-hidden={showLoading}
      >
        {children}
      </span>
      <span
        className={cn(
          "col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5",
          agentOpsOperationFadeClass,
          showLoading ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden={!showLoading}
      >
        {loadingLabel}
      </span>
    </span>
  );
}
