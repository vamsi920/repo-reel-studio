import type { AgentOpsOperationDescriptor } from "@/lib/agentOpsOperations";
import { cn } from "@/lib/utils";

import { AgentOpsSpinner } from "@/components/studio/agent-ops/shared/AgentOpsSpinner";
import {
  agentOpsBusyDotClass,
  agentOpsOperationFadeClass,
} from "@/components/studio/agent-ops/shared/agentOpsMotion";

export type AgentOpsOperationStripProps = {
  operation: AgentOpsOperationDescriptor | null;
  className?: string;
};

export function AgentOpsOperationStrip({ operation, className }: AgentOpsOperationStripProps) {
  return (
    <div
      className={cn("min-h-[22px]", className)}
      aria-live="polite"
      aria-atomic="true"
    >
      <p
        className={cn(
          "inline-flex max-w-full items-center gap-1.5 text-[11px] font-medium leading-[22px]",
          agentOpsOperationFadeClass,
          operation ? "opacity-100" : "pointer-events-none opacity-0",
          operation?.tone === "mutate" && "text-amber-100/85",
          operation?.tone === "neutral" && "text-white/55",
        )}
        aria-hidden={!operation}
      >
        {operation?.tone === "mutate" ? (
          <AgentOpsSpinner className="h-3 w-3 shrink-0" />
        ) : (
          <span className={agentOpsBusyDotClass} aria-hidden />
        )}
        <span className="truncate">{operation?.label ?? "Idle"}</span>
      </p>
      {!operation ? <span className="sr-only">Idle</span> : null}
    </div>
  );
}
