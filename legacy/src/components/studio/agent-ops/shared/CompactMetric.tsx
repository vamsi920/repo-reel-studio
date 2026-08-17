import type { LucideIcon } from "lucide-react";

import {
  agentOpsMetricCellClass,
  agentOpsMetricLabelClass,
} from "@/components/studio/agent-ops/shared/AgentOpsMetricCell";
import {
  agentOpsMetricCellStableClass,
  agentOpsMetricValueClass,
} from "@/components/studio/agent-ops/shared/agentOpsDimensions";
import { cn } from "@/lib/utils";

export function CompactMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <div className={cn(agentOpsMetricCellClass, agentOpsMetricCellStableClass)}>
      <div className={cn(agentOpsMetricLabelClass, "flex items-center gap-1.5")}>
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        {label}
      </div>
      <div className={cn(agentOpsMetricValueClass, "text-base text-foreground")}>{value}</div>
    </div>
  );
}
