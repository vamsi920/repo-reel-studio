import type { AgentRunStatus } from "@/lib/agentRuns";
import type { ProactiveCandidate, ProactiveStatus } from "@/lib/proactiveAgentOps";

import { RUN_ACTIVE_STATUSES } from "@/components/studio/agent-ops/runs/runPipeline";

const PROACTIVE_IN_FLIGHT_STATUSES = [
  "selected",
  "executing",
  "patching",
  "validating",
  "discovering",
  "scoring",
] as const;

const TERMINAL_BATCH_STATUSES = new Set(["complete", "failed", "cancelled"]);

export function resolveProactiveReadyCount(status: ProactiveStatus | null | undefined): number {
  return status?.ready ?? 0;
}

export function reconcileProactiveSelection(
  candidates: ProactiveCandidate[],
  selectedId: string | null,
): string | null {
  if (candidates.length === 0) return null;
  if (selectedId && candidates.some((candidate) => candidate.id === selectedId)) return selectedId;
  return candidates[0]?.id ?? null;
}

export function findSelectedProactiveCandidate(
  candidates: ProactiveCandidate[],
  selectedId: string | null,
): ProactiveCandidate | null {
  if (!selectedId) return null;
  return candidates.find((candidate) => candidate.id === selectedId) ?? null;
}

export function isProactiveWorkActive(status: ProactiveStatus | null, action: string | null): boolean {
  if (action === "dispatch") return true;
  const batchStatus = status?.batch?.status;
  if (batchStatus && !TERMINAL_BATCH_STATUSES.has(batchStatus)) return true;
  return (status?.candidates ?? []).some((candidate) => {
    const candidateStatus = candidate.status;
    const runStatus = candidate.linkedRun?.status;
    return (
      PROACTIVE_IN_FLIGHT_STATUSES.includes(
        candidateStatus as (typeof PROACTIVE_IN_FLIGHT_STATUSES)[number],
      ) ||
      Boolean(runStatus && RUN_ACTIVE_STATUSES.includes(runStatus as AgentRunStatus))
    );
  });
}
