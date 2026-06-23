import { ExternalLink, GitPullRequest } from "lucide-react";

import {
  buildPrPublicationSnapshot,
  prPublicationHeadline,
  type PrPublicationSnapshot,
} from "@/components/studio/agent-ops/runs/prPublicationState";
import type { AgentRun } from "@/lib/agentRuns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PrPublicationStatusBarProps = {
  run: AgentRun;
  isRunActive: boolean;
  isReview: boolean;
  onOpenReviewerBrief?: () => void;
  compact?: boolean;
};

export function PrPublicationStatusBar({
  run,
  isRunActive,
  isReview,
  onOpenReviewerBrief,
  compact = false,
}: PrPublicationStatusBarProps) {
  const snapshot = buildPrPublicationSnapshot(run, isRunActive, isReview);
  const headline = prPublicationHeadline(snapshot);

  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2.5",
        headline.tone === "open" && "border-emerald-300/25 bg-emerald-300/8",
        headline.tone === "draft" && "border-sky-300/20 bg-sky-300/6",
        headline.tone === "approval" && "border-amber-300/25 bg-amber-300/8",
        headline.tone === "pending" && "border-white/10 bg-white/[0.03]",
        headline.tone === "idle" && "border-white/[0.08] bg-white/[0.02]",
      )}
      role="status"
    >
      <div className={cn("flex gap-2", compact ? "flex-col" : "flex-col sm:flex-row sm:items-start sm:justify-between")}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <GitPullRequest className="h-4 w-4 shrink-0 text-white/55" aria-hidden />
            <p className="text-sm font-semibold text-white/88">{headline.title}</p>
          </div>
          <p className="mt-1 text-xs leading-5 text-white/48">{headline.detail}</p>
          <PublicationFacts snapshot={snapshot} />
        </div>

        <div className="flex shrink-0 flex-wrap gap-1.5">
          {snapshot.prUrl ? (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
              <a href={snapshot.prUrl} target="_blank" rel="noreferrer">
                Open PR
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </Button>
          ) : null}
          {onOpenReviewerBrief ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={onOpenReviewerBrief}
            >
              Reviewer brief
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PublicationFacts({ snapshot }: { snapshot: PrPublicationSnapshot }) {
  const facts = [
    snapshot.prUrl ? "GitHub PR linked" : null,
    snapshot.hasReadable ? "Readable packet" : null,
    snapshot.hasDraft ? "Draft body" : null,
    snapshot.needsApproval ? "Approval pending" : null,
    snapshot.approvalStatus === "approved" ? "Run approved" : null,
    snapshot.approvalStatus === "rejected" ? "Run rejected" : null,
  ].filter(Boolean) as string[];

  if (facts.length === 0) return null;

  return (
    <p className="mt-2 text-[11px] text-white/38">{facts.join(" · ")}</p>
  );
}
