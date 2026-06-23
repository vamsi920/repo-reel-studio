import { Fragment, useCallback, type KeyboardEvent, type ReactNode } from "react";

import { proactiveCandidateRadioTabIndex } from "@/components/studio/agent-ops/shared/agentOpsA11y";
import type { ProactiveCandidate } from "@/lib/proactiveAgentOps";

type ProactiveCandidateGridProps = {
  candidates: ProactiveCandidate[];
  selectedCandidateId: string | null;
  onSelectCandidate: (candidateId: string) => void;
  renderCandidateCard: (candidate: ProactiveCandidate, tabIndex: 0 | -1) => ReactNode;
};

export function ProactiveCandidateGrid({
  candidates,
  selectedCandidateId,
  onSelectCandidate,
  renderCandidateCard,
}: ProactiveCandidateGridProps) {
  const ids = candidates.map((candidate) => candidate.id);

  const moveSelection = useCallback(
    (delta: number) => {
      if (candidates.length === 0) return;
      const currentIndex = Math.max(0, ids.indexOf(selectedCandidateId ?? ids[0] ?? ""));
      const nextIndex = (currentIndex + delta + candidates.length) % candidates.length;
      onSelectCandidate(candidates[nextIndex].id);
    },
    [candidates, ids, onSelectCandidate, selectedCandidateId],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          event.preventDefault();
          moveSelection(1);
          break;
        case "ArrowLeft":
        case "ArrowUp":
          event.preventDefault();
          moveSelection(-1);
          break;
        case "Home":
          event.preventDefault();
          if (candidates[0]) onSelectCandidate(candidates[0].id);
          break;
        case "End":
          event.preventDefault();
          if (candidates[candidates.length - 1]) {
            onSelectCandidate(candidates[candidates.length - 1].id);
          }
          break;
        default:
          break;
      }
    },
    [candidates, moveSelection, onSelectCandidate],
  );

  return (
    <div
      role="radiogroup"
      aria-label="Proactive candidates"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      onKeyDown={handleKeyDown}
    >
      {candidates.map((candidate) => (
        <Fragment key={candidate.id}>
          {renderCandidateCard(
            candidate,
            proactiveCandidateRadioTabIndex(candidate.id, selectedCandidateId, ids),
          )}
        </Fragment>
      ))}
    </div>
  );
}
