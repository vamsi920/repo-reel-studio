/** Shared focus-ring and status labeling for Agent Ops surfaces. */
export const agentOpsFocusVisibleClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export const agentOpsRadioFocusClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function statusAriaLabel(category: string, value: string): string {
  return `${category}: ${value}`;
}

/** Roving tabindex for proactive candidate radio items. */
export function proactiveCandidateRadioTabIndex(
  candidateId: string,
  selectedCandidateId: string | null,
  orderedIds: readonly string[],
): 0 | -1 {
  const focusId = selectedCandidateId ?? orderedIds[0] ?? null;
  return candidateId === focusId ? 0 : -1;
}
