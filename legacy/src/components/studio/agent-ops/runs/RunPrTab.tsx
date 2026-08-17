import { ChevronDown, Copy, ExternalLink } from "lucide-react";

import { PrPublicationStatusBar } from "@/components/studio/agent-ops/runs/PrPublicationStatusBar";
import { AGENT_OPS_COPY } from "@/components/studio/agent-ops/shared/agentOpsCopy";
import { agentOpsChevronClass } from "@/components/studio/agent-ops/shared/agentOpsMotion";
import { TabEmpty } from "@/components/studio/agent-ops/shared/TabEmpty";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import type { AgentRun, PrReadable } from "@/lib/agentRuns";
import { cn } from "@/lib/utils";

type RunPrTabProps = {
  run: AgentRun;
  isRunActive: boolean;
  isReview: boolean;
  onOpenReviewerBrief?: () => void;
  onOpenSummary?: () => void;
  onRefreshRun?: () => void;
};

export function RunPrTab({
  run,
  isRunActive,
  isReview,
  onOpenReviewerBrief,
  onOpenSummary,
  onRefreshRun,
}: RunPrTabProps) {
  const prReadable = run.artifacts.prReadable ?? null;
  const prDraft = run.artifacts.prDraft ?? null;
  const prUrl = run.approval?.prUrl?.trim() || null;

  return (
    <article className="min-w-0 space-y-4">
      <PrPublicationStatusBar
        run={run}
        isRunActive={isRunActive}
        isReview={isReview}
        onOpenReviewerBrief={onOpenReviewerBrief}
      />

      {prReadable ? (
        <PrReadableReview
          prReadable={prReadable}
          prDraft={prDraft}
          prUrl={prUrl}
        />
      ) : prDraft ? (
        <PrDraftReview prDraft={prDraft} prUrl={prUrl} />
      ) : (
        <TabEmpty
          title="No PR draft"
          message={isRunActive ? AGENT_OPS_COPY.prDraftPending : AGENT_OPS_COPY.prDraftNeedsApproval}
          action={
            isReview
              ? onOpenReviewerBrief
                ? { label: "Open reviewer brief", onClick: onOpenReviewerBrief }
                : undefined
              : isRunActive
                ? onOpenSummary
                  ? { label: "View summary", onClick: onOpenSummary }
                  : undefined
                : onRefreshRun
                  ? { label: "Refresh run", onClick: onRefreshRun }
                  : onOpenSummary
                    ? { label: "View summary", onClick: onOpenSummary }
                    : undefined
          }
        />
      )}
    </article>
  );
}

function PrReadableReview({
  prReadable,
  prDraft,
  prUrl,
}: {
  prReadable: PrReadable;
  prDraft: AgentRun["artifacts"]["prDraft"];
  prUrl: string | null;
}) {
  const copyToClipboard = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: `${label} copied to clipboard.` });
  };

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-foreground" title={prReadable.title}>
          {prReadable.title}
        </h3>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => copyToClipboard(prReadable.title, "PR title")}
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
            Title
          </Button>
          {prDraft?.body ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => copyToClipboard(prDraft.body, "PR body")}
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
              Body
            </Button>
          ) : null}
          {prUrl ? (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
              <a href={prUrl} target="_blank" rel="noreferrer">
                Open PR
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      {prReadable.reviewerPrompts.length > 0 ? (
        <ul className="space-y-1.5 rounded-md border border-amber-300/18 bg-amber-300/6 px-3 py-2">
          {prReadable.reviewerPrompts.map((prompt) => (
            <li key={prompt} className="text-xs leading-5 text-amber-700/90">
              {prompt}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="divide-y divide-border rounded-md border border-border">
        {prReadable.sections.map((section, index) => (
          <details key={section.heading} className="group" open={index === 0}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 hover:bg-muted/60 [&::-webkit-details-marker]:hidden">
              <span className="text-sm font-medium text-foreground">{section.heading}</span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-muted-foreground group-open:rotate-180",
                  agentOpsChevronClass,
                )}
              />
            </summary>
            <div className="border-t border-border px-3 py-2.5">
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-sans text-sm leading-6 text-foreground/85">
                <code className="whitespace-pre-wrap">{section.body}</code>
              </pre>
            </div>
          </details>
        ))}
      </div>

      {prReadable.checklist.length > 0 ? (
        <section>
          <h4 className="text-xs font-medium text-muted-foreground">Checklist</h4>
          <ul className="mt-1.5 divide-y divide-border rounded-md border border-border">
            {prReadable.checklist.map((item) => (
              <li key={item.label} className="flex items-center gap-2 px-3 py-2" aria-label={`${item.label}, ${item.checked ? "complete" : "incomplete"}`}>
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px]",
                    item.checked ? "bg-emerald-300/15 text-emerald-700" : "bg-muted text-muted-foreground/70",
                  )}
                  aria-hidden
                >
                  {item.checked ? "✓" : ""}
                </span>
                <span className="text-sm text-foreground/80">{item.label}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function PrDraftReview({
  prDraft,
  prUrl,
}: {
  prDraft: NonNullable<AgentRun["artifacts"]["prDraft"]>;
  prUrl: string | null;
}) {
  const copyToClipboard = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: `${label} copied to clipboard.` });
  };

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">Draft title</p>
          <p className="mt-0.5 text-base font-semibold text-foreground">{prDraft.title}</p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => copyToClipboard(prDraft.body, "PR body")}
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
            Copy body
          </Button>
          {prUrl ? (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
              <a href={prUrl} target="_blank" rel="noreferrer">
                Open PR
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="max-h-[min(52vh,26rem)] overflow-auto rounded-md border border-border bg-black/20">
        <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-5 text-white/72">
          <code className="block whitespace-pre">{prDraft.body}</code>
        </pre>
      </div>
    </div>
  );
}
