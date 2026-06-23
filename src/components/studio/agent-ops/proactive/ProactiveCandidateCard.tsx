import { memo } from "react";
import { ExternalLink, GitPullRequest, XCircle } from "lucide-react";

import { CandidateStatusPill } from "@/components/studio/agent-ops/proactive/CandidateStatusPill";
import { CandidateTypeChip } from "@/components/studio/agent-ops/proactive/CandidateTypeChip";
import {
  candidateScorePercent,
  resolveProactiveStatusDisplay,
  resolveProactiveTypeDisplay,
  topCandidateEvidence,
} from "@/components/studio/agent-ops/proactive/proactiveCandidateDisplay";
import { agentOpsRadioFocusClass, statusAriaLabel } from "@/components/studio/agent-ops/shared/agentOpsA11y";
import {
  AGENT_OPS_ACTION_LABEL,
  approveCandidateDisabledReason,
  dismissCandidateDisabledReason,
} from "@/components/studio/agent-ops/shared/agentOpsActions";
import { AGENT_OPS_COPY } from "@/components/studio/agent-ops/shared/agentOpsCopy";
import { agentOpsCandidateCardClass } from "@/components/studio/agent-ops/shared/agentOpsDimensions";
import {
  AgentOpsActionButton,
  AgentOpsActionHint,
  agentOpsCardActionRowClass,
  agentOpsCardPrimaryActionClass,
  agentOpsCardSecondaryActionClass,
  agentOpsCardTertiaryActionClass,
} from "@/components/studio/agent-ops/shared/AgentOpsActionButton";
import type { ProactiveCandidate } from "@/lib/proactiveAgentOps";
import { agentOpsTransitionClass } from "@/components/studio/agent-ops/shared/agentOpsMotion";
import { cn } from "@/lib/utils";

export type ProactiveCandidateCardProps = {
  candidate: ProactiveCandidate;
  tabIndex: 0 | -1;
  selectedRunId: string | null;
  selectedCandidateId: string | null;
  action: string | null;
  onApprove: (candidate: ProactiveCandidate) => void;
  onDismiss: (candidate: ProactiveCandidate) => void;
  onSelectRun: (candidate: ProactiveCandidate) => void;
  onSelectCandidate: (candidateId: string) => void;
};

function ProactiveCandidateCardComponent({
  candidate,
  tabIndex,
  selectedRunId,
  selectedCandidateId,
  action,
  onApprove,
  onDismiss,
  onSelectRun,
  onSelectCandidate,
}: ProactiveCandidateCardProps) {
  const isReady = candidate.status === "review_ready";
  const isDismissed = candidate.status === "dismissed";
  const executionFailure = candidate.executionFailure ?? null;
  const policyBlocked =
    Boolean(candidate.prApprovalBlocked) ||
    candidate.policyStatus === "blocked" ||
    Boolean(candidate.linkedRun?.prApprovalBlocked);
  const policyWarning =
    !policyBlocked &&
    (candidate.policyStatus === "warning" ||
      Boolean(candidate.prPromotionDiscouraged) ||
      Boolean(candidate.linkedRun?.prPromotionDiscouraged));
  const policyLine =
    (policyBlocked
      ? candidate.policySummary ?? candidate.linkedRun?.policySummary ?? "Policy blocked"
      : policyWarning
        ? candidate.policySummary ?? candidate.linkedRun?.policySummary ?? "Policy warning"
        : null) ?? null;
  const isSelectedRun = Boolean(candidate.runId && candidate.runId === selectedRunId);
  const isSelectedCandidate = candidate.id === selectedCandidateId;
  const isSelected = isSelectedCandidate || isSelectedRun;
  const score = candidateScorePercent(candidate);
  const statusLabel = resolveProactiveStatusDisplay(candidate.status, executionFailure).label;
  const typeLabel = resolveProactiveTypeDisplay(candidate.type).label;
  const evidence = topCandidateEvidence(candidate);
  const validationChip = isReady ? candidate.reviewReadySummary?.validationCoverage : null;
  const approving = action === `approve:${candidate.id}`;
  const dismissing = action === `dismiss:${candidate.id}`;
  const approveHintId = `candidate-approve-hint-${candidate.id}`;
  const approveDisabledReason = approveCandidateDisabledReason({
    policyBlocked,
    approving,
    policySummary: policyLine,
  });
  const dismissDisabledReason = dismissCandidateDisabledReason({ dismissing });
  const cardLabel = `${typeLabel} candidate, ${statusLabel}, ${candidate.title}`;

  const stopCardActivate = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
  };

  return (
    <article
      role="radio"
      tabIndex={tabIndex}
      aria-checked={isSelectedCandidate}
      aria-label={cardLabel}
      onClick={() => onSelectCandidate(candidate.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectCandidate(candidate.id);
        }
      }}
      className={cn(
        agentOpsCandidateCardClass,
        "flex min-w-0 max-w-full cursor-pointer flex-col gap-2 rounded-xl border px-3 py-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
        agentOpsTransitionClass,
        "border-white/[0.08] bg-white/[0.035] hover:bg-white/[0.05]",
        agentOpsRadioFocusClass,
        isSelected && "border-emerald-300/35 bg-emerald-300/[0.07] ring-1 ring-emerald-300/30",
        isDismissed && "opacity-55",
      )}
    >
      <div className="flex min-w-0 items-start gap-1.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <CandidateTypeChip type={candidate.type} className="max-w-[min(100%,9.5rem)] truncate" />
          <CandidateStatusPill
            status={candidate.status}
            executionFailure={candidate.executionFailure}
            className="max-w-[min(100%,11rem)]"
          />
          {validationChip ? (
            <span
              className="hidden min-w-0 max-w-full truncate text-[9px] font-medium uppercase tracking-[0.06em] text-emerald-100/70 sm:inline"
              title={statusAriaLabel("Validation coverage", String(validationChip))}
            >
              Val {String(validationChip)}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isSelected ? (
            <span className="rounded border border-emerald-300/30 bg-emerald-300/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-emerald-100">
              {isSelectedCandidate ? "Selected" : "Run open"}
            </span>
          ) : null}
          <span className="tabular-nums text-sm font-semibold text-white/88" aria-label={statusAriaLabel("Score", `${score} percent`)}>
            {score}
          </span>
        </div>
      </div>

      <h4 className="line-clamp-2 text-sm font-semibold leading-snug text-white/90">{candidate.title}</h4>

      <p className="line-clamp-2 text-xs leading-5 text-white/52">{candidate.hypothesis}</p>

      {evidence ? (
        <p className="line-clamp-2 text-[11px] leading-4 text-white/42">
          <span className="font-medium text-white/30">Evidence </span>
          {evidence}
        </p>
      ) : (
        <p className="text-[11px] text-white/32">{AGENT_OPS_COPY.evidenceEmpty}</p>
      )}

      {policyLine ? (
        <p
          className={cn(
            "line-clamp-1 text-[11px] leading-4",
            policyBlocked ? "text-rose-100/85" : "text-amber-100/85",
          )}
        >
          {policyLine}
        </p>
      ) : null}

      {executionFailure ? (
        <p className="line-clamp-1 text-[11px] leading-4 text-rose-100/80" title={executionFailure.reason}>
          <span className="font-medium">{executionFailure.label}: </span>
          {executionFailure.reason}
        </p>
      ) : null}

      <div className={agentOpsCardActionRowClass} onClick={stopCardActivate} onKeyDown={stopCardActivate}>
        {isReady ? (
          <div className="flex min-w-0 w-full flex-col gap-1 sm:w-auto">
            <AgentOpsActionButton
              type="button"
              intent="primary"
              size="sm"
              className={cn(
                agentOpsCardPrimaryActionClass,
                policyWarning && !policyBlocked && "bg-amber-400/90 text-black hover:bg-amber-300",
              )}
              hintId={approveHintId}
              disabled={policyBlocked || approving}
              disabledReason={approveDisabledReason}
              loading={approving}
              loadingLabel="Approving…"
              onClick={(event) => {
                stopCardActivate(event);
                onApprove(candidate);
              }}
            >
              {!approving ? <GitPullRequest className="h-3 w-3 shrink-0" aria-hidden /> : null}
              <span className="truncate">
                {policyBlocked ? "Blocked" : policyWarning ? "Review" : AGENT_OPS_ACTION_LABEL.approve}
              </span>
            </AgentOpsActionButton>
            {policyWarning && !policyBlocked ? (
              <AgentOpsActionHint id={approveHintId}>{AGENT_OPS_COPY.approvePolicyWarning}</AgentOpsActionHint>
            ) : approveDisabledReason && policyBlocked ? (
              <AgentOpsActionHint id={approveHintId} className="text-rose-100/70">
                {approveDisabledReason}
              </AgentOpsActionHint>
            ) : null}
          </div>
        ) : null}

        {candidate.runId ? (
          <AgentOpsActionButton
            type="button"
            intent="secondary"
            size="sm"
            className={agentOpsCardSecondaryActionClass}
            onClick={(event) => {
              stopCardActivate(event);
              onSelectRun(candidate);
            }}
          >
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">
              {isSelectedRun ? "Run open" : AGENT_OPS_ACTION_LABEL.openLinkedRun}
            </span>
          </AgentOpsActionButton>
        ) : null}

        {!isDismissed ? (
          <AgentOpsActionButton
            type="button"
            intent="secondary"
            size="sm"
            className={agentOpsCardTertiaryActionClass}
            disabled={dismissing}
            disabledReason={dismissDisabledReason}
            loading={dismissing}
            loadingLabel="Dismissing…"
            onClick={(event) => {
              stopCardActivate(event);
              onDismiss(candidate);
            }}
          >
            {!dismissing ? <XCircle className="h-3 w-3 shrink-0" aria-hidden /> : null}
            {AGENT_OPS_ACTION_LABEL.dismiss}
          </AgentOpsActionButton>
        ) : null}
      </div>
    </article>
  );
}

export const ProactiveCandidateCard = memo(ProactiveCandidateCardComponent);

