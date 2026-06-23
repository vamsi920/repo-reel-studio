import type { AgentOpsAttention } from "@/lib/agentOpsAttention";
import type { ProactiveCandidate, ProactiveConfig, ProactiveStatus } from "@/lib/proactiveAgentOps";
import { applyProactiveCandidatePatch } from "@/lib/proactiveAgentOps";

import { reconcileProactiveSelection } from "@/components/studio/agent-ops/agentRunsPanelHelpers";

export function mergeProactiveBackendAttention(
  fromHealth: AgentOpsAttention | null,
  previous: AgentOpsAttention | null,
  proactiveLoadFailed: boolean,
): AgentOpsAttention | null {
  if (fromHealth) return fromHealth;
  if (proactiveLoadFailed && previous) return previous;
  return null;
}

export function mergeProactiveStatusAfterToggle(
  previous: ProactiveStatus | null,
  config: ProactiveConfig,
): ProactiveStatus {
  if (previous) return { ...previous, config };
  return {
    config,
    batch: null,
    ready: 0,
    target: config.targetCount,
    candidates: [],
  };
}

export function patchProactiveCandidateState(
  previous: ProactiveStatus | null,
  candidate: ProactiveCandidate,
  options?: { removeFromList?: boolean; batch?: ProactiveStatus["batch"] },
): ProactiveStatus | null {
  if (!previous) return previous;
  return applyProactiveCandidatePatch(previous, candidate, options);
}

export function nextProactiveSelectionAfterDismiss(
  status: ProactiveStatus,
  dismissedId: string,
  selectedId: string | null,
): string | null {
  const preferNull = selectedId === dismissedId ? null : selectedId;
  return reconcileProactiveSelection(status.candidates, preferNull);
}
