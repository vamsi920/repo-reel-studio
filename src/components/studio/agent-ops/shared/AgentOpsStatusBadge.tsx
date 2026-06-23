import { statusAriaLabel } from "@/components/studio/agent-ops/shared/agentOpsA11y";
import { resolveRunStatusDisplay, runStatusBadgeClass } from "@/components/studio/agent-ops/runs/runStatusDisplay";
import {
  proactiveStatusBadgeClass,
  resolveProactiveStatusDisplay,
} from "@/components/studio/agent-ops/proactive/proactiveStatusDisplay";
import type { ProactiveCandidate } from "@/lib/proactiveAgentOps";
import { cn } from "@/lib/utils";

type AgentOpsStatusBadgeProps = {
  label: string;
  className: string;
  title?: string;
};

function AgentOpsStatusBadge({ label, className, title }: AgentOpsStatusBadgeProps) {
  return (
    <span aria-label={statusAriaLabel("Status", label)} className={className} title={title}>
      {label}
    </span>
  );
}

export function RunStatusBadge({
  status,
  variant = "full",
  className,
}: {
  status: unknown;
  variant?: "full" | "short";
  className?: string;
}) {
  const display = resolveRunStatusDisplay(status);
  const label = variant === "short" ? display.shortLabel : display.label;
  return (
    <AgentOpsStatusBadge
      label={label}
      className={cn(runStatusBadgeClass(status), className)}
      title={!display.known ? `Unknown status: ${display.key}` : undefined}
    />
  );
}

export function ProactiveStatusBadge({
  status,
  executionFailure,
  className,
}: {
  status: unknown;
  executionFailure?: ProactiveCandidate["executionFailure"];
  className?: string;
}) {
  const display = resolveProactiveStatusDisplay(status, executionFailure);
  return (
    <AgentOpsStatusBadge
      label={display.label}
      className={cn(proactiveStatusBadgeClass(status, executionFailure), className)}
      title={!display.known ? `Unknown status: ${display.key}` : undefined}
    />
  );
}
