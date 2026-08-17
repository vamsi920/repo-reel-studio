import { AGENT_OPS_COPY } from "@/components/studio/agent-ops/shared/agentOpsCopy";
import { FixStoryPreview } from "@/components/studio/FixStoryPreview";
import { PrPublicationStatusBar } from "@/components/studio/agent-ops/runs/PrPublicationStatusBar";
import type { AgentRun } from "@/lib/agentRuns";
import { Button } from "@/components/ui/button";

type RunReviewerBriefTabProps = {
  run: AgentRun;
  isRunActive: boolean;
  isReview: boolean;
  onOpenPrTab?: () => void;
};

export function RunReviewerBriefTab({ run, isRunActive, isReview, onOpenPrTab }: RunReviewerBriefTabProps) {
  return (
    <article className="min-w-0 space-y-4">
      <div className="space-y-2">
        <PrPublicationStatusBar run={run} isRunActive={isRunActive} isReview={isReview} compact />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs leading-5 text-muted-foreground">
            {AGENT_OPS_COPY.reviewerBriefNote}
          </p>
          {onOpenPrTab ? (
            <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 text-xs" onClick={onOpenPrTab}>
              Open PR tab
            </Button>
          ) : null}
        </div>
      </div>

      <FixStoryPreview run={run} />
    </article>
  );
}
