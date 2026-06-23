import type { ReactNode } from "react";

import {
  agentOpsMetricCellStableClass,
  agentOpsMetricSubClass,
  agentOpsMetricValueClass,
} from "@/components/studio/agent-ops/shared/agentOpsDimensions";
import { cn } from "@/lib/utils";

export const agentOpsMetricCellClass =
  "rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-2";

export const agentOpsMetricLabelClass =
  "text-[9px] font-medium uppercase tracking-[0.08em] text-white/34";

type AgentOpsMetricCellProps = {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  emphasize?: boolean;
  className?: string;
};

export function AgentOpsMetricCell({ label, value, sub, emphasize = false, className }: AgentOpsMetricCellProps) {
  return (
    <div className={cn(agentOpsMetricCellClass, agentOpsMetricCellStableClass, className)}>
      <dt className={agentOpsMetricLabelClass}>{label}</dt>
      <dd
        className={cn(
          agentOpsMetricValueClass,
          "text-white/82",
          emphasize && "text-emerald-100",
          !sub && "capitalize",
        )}
      >
        {value}
      </dd>
      {sub ? <dd className={cn(agentOpsMetricSubClass, "text-white/36")}>{sub}</dd> : null}
    </div>
  );
}
