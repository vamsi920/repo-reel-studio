import { RunPrTab } from "@/components/studio/agent-ops/runs/RunPrTab";
import { RunReviewerBriefTab } from "@/components/studio/agent-ops/runs/RunReviewerBriefTab";
import type { AgentRun } from "@/lib/agentRuns";

type RunShipTabProps = {
  run: AgentRun;
  isRunActive: boolean;
  isReview: boolean;
  onRefreshRun: () => void;
  onOpenSummary?: () => void;
  onOpenReviewerBrief?: () => void;
};

export function RunShipTab({
  run,
  isRunActive,
  isReview,
  onRefreshRun,
  onOpenSummary,
  onOpenReviewerBrief,
}: RunShipTabProps) {
  return (
    <div className="min-w-0 space-y-6">
      <section aria-labelledby="run-ship-pr-heading">
        <h4 id="run-ship-pr-heading" className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/36">
          Pull request
        </h4>
        <RunPrTab
          run={run}
          isRunActive={isRunActive}
          isReview={isReview}
          onRefreshRun={onRefreshRun}
          onOpenSummary={onOpenSummary}
          onOpenReviewerBrief={
            onOpenReviewerBrief ??
            (() => document.getElementById("run-ship-brief-heading")?.scrollIntoView({ block: "nearest" }))
          }
        />
      </section>

      <section aria-labelledby="run-ship-brief-heading">
        <h4 id="run-ship-brief-heading" className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/36">
          Reviewer brief
        </h4>
        <RunReviewerBriefTab run={run} isRunActive={isRunActive} isReview={isReview} />
      </section>
    </div>
  );
}
