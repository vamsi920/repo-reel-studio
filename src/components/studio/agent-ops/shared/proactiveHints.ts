import { fmtRelative } from "@/components/studio/agent-ops/shared/timeFormat";
import type { ProactiveStatus } from "@/lib/proactiveAgentOps";

export { formatProactiveHint, parseAgentOpsAttention } from "@/lib/agentOpsAttention";

export function proactiveDispatchLabel(
  batch: ProactiveStatus["batch"],
  enabled: boolean,
  target: number,
  deadline: string,
) {
  if (batch?.dispatchCompletedAt) return `Last scan ${fmtRelative(batch.dispatchCompletedAt)}`;
  if (batch?.dispatchStartedAt) return `Scanning since ${fmtRelative(batch.dispatchStartedAt)}`;
  if (!enabled) return `Off — enable before ${deadline}`;
  return "No scan yet";
}

export function proactiveShortfallReason(status: ProactiveStatus | null) {
  const fromStatus = status?.shortfallReason?.trim();
  if (fromStatus) return fromStatus;
  const fromBatch = status?.batch?.metrics?.shortfallReason?.trim();
  return fromBatch || null;
}

export function formatBatchStatusLabel(batch: ProactiveStatus["batch"], loading: boolean) {
  if (loading && !batch) return "Loading";
  if (!batch) return "No batch";
  const label = (batch.status || "unknown").replace(/_/g, " ");
  if (batch.dispatchStartedAt && !batch.dispatchCompletedAt) return `${label} · running`;
  return label;
}
