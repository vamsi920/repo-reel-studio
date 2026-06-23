import type { ProactiveCandidate } from "@/lib/proactiveAgentOps";

export {
  candidateStatusTone,
  humanizeCandidateStatus,
  humanizeCandidateType,
  normalizeProactiveStatusKey,
  normalizeProactiveTypeKey,
  proactiveStatusBadgeClass,
  proactiveTypeBadgeClass,
  resolveProactiveStatusDisplay,
  resolveProactiveTypeDisplay,
} from "@/components/studio/agent-ops/proactive/proactiveStatusDisplay";

export function candidateScorePercent(candidate: ProactiveCandidate) {
  return Math.round((candidate.score?.total ?? 0) * 100);
}

export function topCandidateEvidence(candidate: ProactiveCandidate) {
  return candidate.evidence.find((item) => item?.trim())?.trim() ?? null;
}
