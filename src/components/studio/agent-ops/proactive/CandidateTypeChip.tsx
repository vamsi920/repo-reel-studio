import {
  proactiveTypeBadgeClass,
  resolveProactiveTypeDisplay,
} from "@/components/studio/agent-ops/proactive/proactiveStatusDisplay";
import { statusAriaLabel } from "@/components/studio/agent-ops/shared/agentOpsA11y";
import type { ProactiveCandidateType } from "@/lib/proactiveAgentOps";
import { cn } from "@/lib/utils";

export function CandidateTypeChip({ type, className }: { type: ProactiveCandidateType; className?: string }) {
  const display = resolveProactiveTypeDisplay(type);
  return (
    <span
      aria-label={statusAriaLabel("Type", display.label)}
      className={cn(proactiveTypeBadgeClass(type), className)}
      title={!display.known ? `Unknown type: ${display.key}` : undefined}
    >
      {display.label}
    </span>
  );
}
