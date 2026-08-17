import { AgentOpsMetricCell } from "@/components/studio/agent-ops/shared/AgentOpsMetricCell";

export function MetricPill({ label, value }: { label: string; value: string }) {
  return <AgentOpsMetricCell label={label} value={value} />;
}
