import { memo, useCallback } from "react";

import { ProactiveCandidateCard } from "@/components/studio/agent-ops/proactive/ProactiveCandidateCard";
import { ProactiveCandidateGrid } from "@/components/studio/agent-ops/proactive/ProactiveCandidateGrid";
import type { ProactiveCandidate } from "@/lib/proactiveAgentOps";

export type ProactiveCandidateCardListProps = {
  candidates: ProactiveCandidate[];
  selectedRunId: string | null;
  selectedCandidateId: string | null;
  action: string | null;
  onSelectCandidate: (candidateId: string) => void;
  onApprove: (candidate: ProactiveCandidate) => void;
  onDismiss: (candidate: ProactiveCandidate) => void;
  onSelectRun: (candidate: ProactiveCandidate) => void;
};

function ProactiveCandidateCardListComponent({
  candidates,
  selectedRunId,
  selectedCandidateId,
  action,
  onSelectCandidate,
  onApprove,
  onDismiss,
  onSelectRun,
}: ProactiveCandidateCardListProps) {
  const renderCandidateCard = useCallback(
    (candidate: ProactiveCandidate, tabIndex: 0 | -1) => (
      <ProactiveCandidateCard
        candidate={candidate}
        tabIndex={tabIndex}
        selectedRunId={selectedRunId}
        selectedCandidateId={selectedCandidateId}
        action={action}
        onApprove={onApprove}
        onDismiss={onDismiss}
        onSelectRun={onSelectRun}
        onSelectCandidate={onSelectCandidate}
      />
    ),
    [action, onApprove, onDismiss, onSelectCandidate, onSelectRun, selectedCandidateId, selectedRunId],
  );

  return (
    <ProactiveCandidateGrid
      candidates={candidates}
      selectedCandidateId={selectedCandidateId}
      onSelectCandidate={onSelectCandidate}
      renderCandidateCard={renderCandidateCard}
    />
  );
}

export const ProactiveCandidateCardList = memo(ProactiveCandidateCardListComponent);
