import { Loader2 } from "lucide-react";

import { agentOpsSpinnerClass } from "@/components/studio/agent-ops/shared/agentOpsMotion";
import { cn } from "@/lib/utils";

type AgentOpsSpinnerProps = {
  className?: string;
};

export function AgentOpsSpinner({ className }: AgentOpsSpinnerProps) {
  return <Loader2 className={cn(agentOpsSpinnerClass, className)} aria-hidden />;
}
