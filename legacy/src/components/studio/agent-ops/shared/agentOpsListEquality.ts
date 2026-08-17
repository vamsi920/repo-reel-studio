import type { AgentRun, AgentRunStatus } from "@/lib/agentRuns";
import type { ProactiveCandidate, ProactiveStatus } from "@/lib/proactiveAgentOps";

import { RUN_ACTIVE_STATUSES } from "@/components/studio/agent-ops/runs/runPipeline";

const ACTIVE_STATUS_SET = new Set<AgentRunStatus>(RUN_ACTIVE_STATUSES);

export function countActiveRuns(runs: AgentRun[]): number {
  let count = 0;
  for (const run of runs) {
    if (ACTIVE_STATUS_SET.has(run.status)) count += 1;
  }
  return count;
}

export function runsHaveActiveWork(runs: AgentRun[]): boolean {
  return countActiveRuns(runs) > 0;
}

function runQueueSignature(run: AgentRun): string {
  const timelineTail = run.timeline[run.timeline.length - 1];
  return [
    run.id,
    run.status,
    run.updatedAt,
    timelineTail?.at ?? "",
    timelineTail?.title ?? "",
  ].join("\u0001");
}

export function areAgentRunsListsEqual(left: AgentRun[], right: AgentRun[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (runQueueSignature(left[index]) !== runQueueSignature(right[index])) return false;
  }
  return true;
}

function candidateSignature(candidate: ProactiveCandidate): string {
  return [
    candidate.id,
    candidate.status,
    candidate.updatedAt,
    candidate.runId ?? "",
    candidate.linkedRun?.status ?? "",
    candidate.linkedRun?.updatedAt ?? "",
  ].join("\u0001");
}

function proactiveBatchSignature(batch: ProactiveStatus["batch"]): string {
  if (!batch) return "";
  return [
    batch.id,
    batch.status,
    batch.dispatchStartedAt ?? "",
    batch.dispatchCompletedAt ?? "",
    batch.progress.ready,
    batch.progress.discovered,
  ].join("\u0001");
}

export function areProactiveStatusesEqual(
  left: ProactiveStatus | null,
  right: ProactiveStatus | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;

  if (
    left.ready !== right.ready ||
    left.target !== right.target ||
    left.config.enabled !== right.config.enabled ||
    left.config.targetCount !== right.config.targetCount ||
    (left.shortfallReason ?? "") !== (right.shortfallReason ?? "")
  ) {
    return false;
  }

  if (proactiveBatchSignature(left.batch) !== proactiveBatchSignature(right.batch)) return false;

  const leftCandidates = left.candidates;
  const rightCandidates = right.candidates;
  if (leftCandidates.length !== rightCandidates.length) return false;
  for (let index = 0; index < leftCandidates.length; index += 1) {
    if (candidateSignature(leftCandidates[index]) !== candidateSignature(rightCandidates[index])) {
      return false;
    }
  }

  return true;
}

export function proactiveCandidateIdsKey(candidates: ProactiveCandidate[]): string {
  if (candidates.length === 0) return "";
  return candidates.map((candidate) => `${candidate.id}:${candidate.status}`).join("|");
}
