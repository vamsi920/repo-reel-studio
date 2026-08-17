import { ProactiveStatusBadge } from "@/components/studio/agent-ops/shared/AgentOpsStatusBadge";
import type { ProactiveCandidate, ProactiveCandidateStatus } from "@/lib/proactiveAgentOps";
import { cn } from "@/lib/utils";

export function CandidateStatusPill({
  status,
  executionFailure,
  className,
}: {
  status: ProactiveCandidateStatus;
  executionFailure?: ProactiveCandidate["executionFailure"];
  className?: string;
}) {
  return <ProactiveStatusBadge status={status} executionFailure={executionFailure} className={cn(className)} />;
}
