import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import TerminalIcon from "#/icons/terminal.svg?react";
import {
  AutomationRunStatus,
  type Automation,
  type AutomationRun,
} from "#/types/automation";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { isRateLimitErrorDetail } from "#/components/features/home/featured-automations/automation-run-health";
import { RunStatusBadge } from "./run-status-badge";
import { RunLogsModal } from "./run-logs-modal";
import { parseProactivationMarker } from "#/utils/proactivation-prompt";
import { getCreatePRPrompt } from "#/utils/utils";
import { setConversationState } from "#/utils/conversation-local-storage";
import { useNavigation } from "#/context/navigation-context";
import { useWorkspaceMemoryStore } from "#/stores/workspace-memory-store";
import { submitMemoryCandidate } from "#/lib/workspace-memory/memory-updater";
import { BrandButton } from "#/components/features/settings/brand-button";
import { useCancelAutomationRun } from "#/hooks/query/use-automations";
import { isInFlightAutomationRun } from "#/hooks/use-home-automation-actions";
import { useHasPermission } from "#/hooks/use-has-permission";
import { useDismissedProactivationRuns } from "#/hooks/use-dismissed-proactivation-runs";
import { getApiErrorMessage } from "#/utils/api-error-message";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { useRunReport } from "#/hooks/query/use-run-outcome";
import { useAutomationPolicies } from "#/hooks/query/use-automation-policies";
import type { GuardCancelReason } from "#/api/automation-policy-service";
import { MarkdownRenderer } from "#/components/features/markdown/markdown-renderer";
import {
  hasDeliveryContract,
  type RunErrorKind,
  type RunOutcome,
} from "#/lib/automation/delivery-contract";

const OUTCOME_CHIP =
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium";

/**
 * What the run delivered, from its RESULT line. Shown instead of the status
 * badge when it adds something the status cannot say: a COMPLETED run that
 * never proved a delivery, or a FAILED run that was resumed and delivered.
 */
function RunOutcomeChip({
  outcome,
  run,
}: {
  outcome: RunOutcome;
  run: AutomationRun;
}) {
  const { t } = useTranslation("openhands");

  if (outcome.kind === "delivered") {
    const recovered = run.status === AutomationRunStatus.FAILED;
    const open = (
      e:
        | React.MouseEvent<HTMLButtonElement>
        | React.KeyboardEvent<HTMLButtonElement>,
    ) => {
      // The row itself links to the conversation.
      e.stopPropagation();
      e.preventDefault();
      window.open(outcome.url, "_blank", "noopener,noreferrer");
    };
    return (
      <StyledTooltip
        content={
          recovered
            ? t(I18nKey.AUTOMATIONS$DETAIL$OUTCOME_RECOVERED_HINT, {
                url: outcome.url,
              })
            : outcome.url
        }
        placement="top"
      >
        <button
          type="button"
          data-testid="run-outcome-delivered"
          onClick={open}
          aria-label={t(I18nKey.AUTOMATIONS$DETAIL$OUTCOME_OPEN, {
            url: outcome.url,
          })}
          className={`${OUTCOME_CHIP} border-[var(--oh-success)]/50 bg-[var(--oh-success)]/10 text-success hover:bg-[var(--oh-success)]/20`}
        >
          {recovered
            ? t(I18nKey.AUTOMATIONS$DETAIL$OUTCOME_RECOVERED)
            : t(I18nKey.AUTOMATIONS$DETAIL$OUTCOME_DELIVERED)}
        </button>
      </StyledTooltip>
    );
  }

  if (outcome.kind === "failed") {
    return (
      <StyledTooltip content={outcome.reason} placement="top">
        <span
          data-testid="run-outcome-failed"
          className={`${OUTCOME_CHIP} border-[var(--oh-danger)]/50 bg-[var(--oh-danger)]/10 text-danger`}
        >
          {t(I18nKey.AUTOMATIONS$DETAIL$OUTCOME_NOT_DELIVERED)}
        </span>
      </StyledTooltip>
    );
  }

  return (
    <StyledTooltip
      content={t(I18nKey.AUTOMATIONS$DETAIL$OUTCOME_UNVERIFIED_HINT)}
      placement="top"
    >
      <span
        data-testid="run-outcome-unverified"
        className={`${OUTCOME_CHIP} border-[var(--oh-warning)]/50 bg-[var(--oh-warning)]/10 text-[var(--oh-warning)]`}
      >
        {t(I18nKey.AUTOMATIONS$DETAIL$OUTCOME_UNVERIFIED)}
      </span>
    </StyledTooltip>
  );
}

const GUARD_CANCEL_LABELS: Record<GuardCancelReason, I18nKey> = {
  budget: I18nKey.AUTOMATIONS$GUARD$CANCELLED_BUDGET,
  rate_limit: I18nKey.AUTOMATIONS$GUARD$CANCELLED_RATE_LIMIT,
  overlap: I18nKey.AUTOMATIONS$GUARD$CANCELLED_OVERLAP,
};

const RUN_ERROR_HINTS: Partial<Record<RunErrorKind, I18nKey>> = {
  llm_auth: I18nKey.AUTOMATIONS$DETAIL$ERROR_HINT_LLM_AUTH,
  llm_quota: I18nKey.AUTOMATIONS$DETAIL$ERROR_HINT_LLM_QUOTA,
  context_window: I18nKey.AUTOMATIONS$DETAIL$ERROR_HINT_CONTEXT,
  budget: I18nKey.AUTOMATIONS$DETAIL$ERROR_HINT_BUDGET,
};

/** Characters of the report shown on the row before "Show full report". */
const REPORT_PREVIEW_LENGTH = 220;

/**
 * The run's final report under its row: what it found and did, readable
 * without opening the conversation. A failed run without a report shows its
 * error instead.
 */
function RunReportPreview({
  text,
  error,
  errorKind,
}: {
  text: string | null;
  error: string | null;
  errorKind: RunErrorKind | null;
}) {
  const { t } = useTranslation("openhands");
  const [expanded, setExpanded] = useState(false);
  const body = text ?? error;
  if (!body) return null;
  const hint = !text && errorKind ? RUN_ERROR_HINTS[errorKind] : undefined;
  const isLong = body.length > REPORT_PREVIEW_LENGTH;
  const flat = body.replace(/\s+/g, " ").trim();

  return (
    <div
      data-testid="run-report"
      className="flex flex-col gap-1 px-5 pb-3 text-xs text-muted"
    >
      {expanded && text ? (
        <div className="max-h-96 overflow-y-auto rounded-lg border border-[var(--oh-border)] bg-surface-raised p-3 text-sm text-content">
          <MarkdownRenderer>{text}</MarkdownRenderer>
        </div>
      ) : (
        <p className={text ? "" : "text-danger"}>
          {isLong ? `${flat.slice(0, REPORT_PREVIEW_LENGTH)}…` : flat}
        </p>
      )}
      {hint && (
        <p data-testid="run-error-hint" className="text-content">
          {t(hint)}
        </p>
      )}
      {text && isLong && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="self-start text-xs text-muted underline-offset-2 hover:text-content hover:underline"
        >
          {expanded
            ? t(I18nKey.AUTOMATIONS$DETAIL$HIDE_REPORT)
            : t(I18nKey.AUTOMATIONS$DETAIL$SHOW_REPORT)}
        </button>
      )}
    </div>
  );
}

/** Whether the outcome replaces the plain status badge for this run. */
function shouldShowOutcome(
  outcome: RunOutcome | null,
  run: AutomationRun,
): outcome is RunOutcome {
  if (!outcome) return false;
  if (run.status === AutomationRunStatus.COMPLETED) return true;
  // A FAILED run only changes meaning when it was recovered and delivered;
  // otherwise its own failure (and rate-limit hint) is the right message.
  return outcome.kind === "delivered";
}

interface ActivityLogItemProps {
  run: AutomationRun;
  automation?: Automation;
}

function formatRunTimestamp(dateStr: string, locale: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isInvalidTimestamp(dateStr: string | null | undefined): boolean {
  if (!dateStr) return true;
  const t = new Date(dateStr).getTime();
  return Number.isNaN(t) || t === 0;
}

function getConversationUrl(conversationId: string): string {
  // In agent-canvas, conversations are at /conversations/:id
  return `/conversations/${conversationId}`;
}

/**
 * Format the run's accumulated LLM cost, or return null when it is unknown.
 *
 * A genuine `0` is rendered (`$0.0000`) rather than hidden: the automation
 * service records zero only when the SDK reported a real zero-cost run, and
 * leaves the value null when the cost could not be determined. Matches the
 * 4-decimal USD convention used by the conversation metrics modal.
 */
function formatRunCost(cost: number | null | undefined): string | null {
  if (typeof cost !== "number" || !Number.isFinite(cost)) return null;
  return `$${cost.toFixed(4)}`;
}

function DismissReasonModal({
  isOpen,
  onCancel,
  onConfirm,
}: {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const { t } = useTranslation("openhands");
  const [reason, setReason] = useState("");

  // The parent always renders this component, only toggling `isOpen` (it
  // returns null internally below instead of unmounting), so this instance
  // never unmounts on close. Without this, cancelling out of a typed-but-
  // unsubmitted reason left it pre-filled with that stale draft the next
  // time the dialog was reopened for the same or a different run.
  useEffect(() => {
    if (isOpen) setReason("");
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <ModalBackdrop
      onClose={onCancel}
      aria-label={t(I18nKey.AUTOMATIONS$PROACTIVATION_DISMISS_TITLE)}
    >
      <div className="relative w-full max-w-sm rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)] p-5">
        <h3 className="text-sm font-semibold text-content">
          {t(I18nKey.AUTOMATIONS$PROACTIVATION_DISMISS_TITLE)}
        </h3>
        <label className="mt-3 flex flex-col gap-1.5 text-xs text-muted">
          {t(I18nKey.AUTOMATIONS$PROACTIVATION_DISMISS_REASON_LABEL)}
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={t(
              I18nKey.AUTOMATIONS$PROACTIVATION_DISMISS_REASON_PLACEHOLDER,
            )}
            className="rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-raised)] p-2 text-sm text-content"
          />
        </label>
        <div className="mt-3 flex justify-end gap-2">
          <BrandButton type="button" variant="secondary" onClick={onCancel}>
            {t(I18nKey.AUTOMATIONS$CANCEL)}
          </BrandButton>
          <BrandButton
            type="button"
            variant="primary"
            isDisabled={reason.trim().length === 0}
            onClick={() => onConfirm(reason.trim())}
          >
            {t(I18nKey.AUTOMATIONS$PROACTIVATION_DISMISS_SUBMIT)}
          </BrandButton>
        </div>
      </div>
    </ModalBackdrop>
  );
}

export function ActivityLogItem({ run, automation }: ActivityLogItemProps) {
  const { t, i18n } = useTranslation("openhands");
  const { navigate } = useNavigation();
  const activeWorkspaceId = useWorkspaceMemoryStore((s) => s.activeWorkspaceId);
  const canManage = useHasPermission("manage_automations");
  const cancelMutation = useCancelAutomationRun();
  const hasConversation = !!run.conversation_id;
  const hasBashCommand = !!run.bash_command_id;
  // Only surface "Conversation not created" when the run has reached a
  // terminal status without a conversation — i.e. the conversation truly
  // will not be created (e.g. sandbox provisioning failed). While
  // PENDING/RUNNING the conversation may still be in the process of being
  // created, and the status badge already communicates the in-progress
  // state.
  const isTerminal =
    run.status === AutomationRunStatus.COMPLETED ||
    run.status === AutomationRunStatus.FAILED;
  const showNoConversationLabel = !hasConversation && isTerminal;
  const [logsOpen, setLogsOpen] = useState(false);
  const { isDismissed: isRunDismissed, dismiss: dismissRun } =
    useDismissedProactivationRuns();
  const isDismissed = isRunDismissed(run.id);
  const [isDismissModalOpen, setIsDismissModalOpen] = useState(false);

  const report = useRunReport(run);
  const outcome = hasDeliveryContract(automation?.prompt)
    ? (report?.outcome ?? null)
    : null;
  const { data: guardData } = useAutomationPolicies();
  const guardCancel =
    run.status === AutomationRunStatus.CANCELLED
      ? (guardData?.guard.cancelled?.[run.id] ?? null)
      : null;
  // The service records only "Remote conversation ended with error"; the
  // conversation says why.
  const failureLine =
    run.status === AutomationRunStatus.FAILED
      ? (report?.error?.summary ??
        (run.error_detail ? run.error_detail.split("\n")[0] : null))
      : null;
  const proactivationConfig = parseProactivationMarker(automation?.prompt);
  const showProactivationActions =
    !!proactivationConfig &&
    proactivationConfig.autonomyLevel === "prepare-fix" &&
    run.status === AutomationRunStatus.COMPLETED &&
    hasConversation &&
    !isDismissed;

  const handleCreatePr = (
    e:
      | React.MouseEvent<HTMLButtonElement>
      | React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (!run.conversation_id) return;
    // The automation's repository has no persisted git provider today, so
    // this follows the same GitHub-default assumption the setup wizard's
    // repo picker makes for the MVP. Prefilling the draft (rather than
    // sending straight to a possibly-inactive conversation runtime) reuses
    // the exact pattern recommended-automations-launcher.tsx already uses.
    setConversationState(run.conversation_id, {
      draftMessage: `${getCreatePRPrompt("github")} You already prepared this change on a branch earlier in this conversation — use that branch and diff.`,
    });
    navigate?.(getConversationUrl(run.conversation_id));
  };

  const handleDismissClick = (
    e:
      | React.MouseEvent<HTMLButtonElement>
      | React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDismissModalOpen(true);
  };

  // No sweep anywhere -- server or client -- ever cancels a run left RUNNING
  // after a crash (e.g. the automation service being OOM-killed mid-run); it
  // just sits there until someone does this by hand.
  const canCancel = canManage && !!automation && isInFlightAutomationRun(run);
  const isCancelling =
    cancelMutation.isPending && cancelMutation.variables?.runId === run.id;

  const handleCancelClick = async (
    e:
      | React.MouseEvent<HTMLButtonElement>
      | React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (!automation) return;
    try {
      // A rapid double-click before the first call settles used to drop the
      // first call's `onError` (react-query's mutation observer keeps only
      // the latest call's per-call callbacks). `mutateAsync` returns this
      // specific call's own promise, so awaiting it here is safe under
      // concurrency, matching automation-detail.tsx's handleToggle.
      await cancelMutation.mutateAsync({
        automationId: automation.id,
        runId: run.id,
      });
    } catch (error) {
      displayErrorToast(
        getApiErrorMessage(
          error,
          t(I18nKey.AUTOMATIONS$DETAIL$CANCEL_RUN_ERROR),
        ),
      );
    }
  };

  const handleDismissConfirm = (reason: string) => {
    if (activeWorkspaceId) {
      submitMemoryCandidate({
        workspaceId: activeWorkspaceId,
        kind: "outcome",
        subject: `proactivation:${automation?.id ?? "unknown"}:${run.id}`,
        statement: `A Proactivation candidate from run ${run.id} was dismissed. Reason: ${reason}`,
        tags: ["proactivation", "dismissed"],
        provenance: {
          source: "user-decision",
          sourceId: run.id,
          conversationId: run.conversation_id,
          observedAt: new Date().toISOString(),
        },
      });
    }
    setIsDismissModalOpen(false);
    dismissRun(run.id);
  };
  // The backend leaves started_at unset (epoch/zero) while a run is Pending
  // and only populates it once execution begins. Show the user's local time
  // at first render in that window so the row doesn't read "Jan 1, 1970".
  const [fallbackStartedAt] = useState(() => new Date().toISOString());
  const effectiveStartedAt = isInvalidTimestamp(run.started_at)
    ? fallbackStartedAt
    : run.started_at;

  const formattedTimestamp = formatRunTimestamp(
    effectiveStartedAt,
    i18n.language,
  );
  const formattedCost = formatRunCost(run.cost);
  // The default LLM profile's daily provider quota can exhaust mid-day
  // (litellm surfaces this as RESOURCE_EXHAUSTED / RateLimitError); a bare
  // "Failed" badge reads as a bug in this automation when it's really
  // upstream capacity, so call it out specifically and keep the raw detail
  // available on hover.
  const isRateLimitFailure =
    run.status === AutomationRunStatus.FAILED &&
    !!run.error_detail &&
    isRateLimitErrorDetail(run.error_detail);

  const handleLogsClick = (
    e:
      | React.MouseEvent<HTMLButtonElement>
      | React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    // Stop the click bubbling up to the parent <a> so the user stays on
    // the automation detail page instead of navigating to the conversation.
    e.stopPropagation();
    e.preventDefault();
    setLogsOpen(true);
  };

  const logsButton = hasBashCommand ? (
    <button
      type="button"
      onClick={handleLogsClick}
      className="rounded-md p-1 text-muted hover:bg-surface-raised hover:text-foreground focus:bg-surface-raised focus:outline-none"
      aria-label={t(I18nKey.AUTOMATIONS$DETAIL$LOGS_VIEW, {
        timestamp: formattedTimestamp,
      })}
      title={t(I18nKey.AUTOMATIONS$DETAIL$LOGS_VIEW_SHORT)}
    >
      <TerminalIcon className="size-4" />
    </button>
  ) : null;

  const content = (
    <>
      <div className="flex items-center gap-3">
        <span className="text-sm text-content">{formattedTimestamp}</span>
        {showNoConversationLabel && (
          <span className="text-xs text-muted">
            {t(I18nKey.AUTOMATIONS$DETAIL$NO_CONVERSATION)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {formattedCost && (
          <span
            data-testid="run-cost"
            title={t(I18nKey.AUTOMATIONS$DETAIL$RUN_COST)}
            className="text-xs tabular-nums text-muted"
          >
            {formattedCost}
          </span>
        )}
        {showProactivationActions && (
          <>
            <button
              type="button"
              onClick={handleDismissClick}
              className="rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-raised hover:text-foreground"
            >
              {t(I18nKey.AUTOMATIONS$PROACTIVATION_DISMISS)}
            </button>
            <button
              type="button"
              onClick={handleCreatePr}
              className="rounded-md border border-[var(--oh-border)] px-2 py-1 text-xs font-medium text-content hover:bg-surface-raised"
            >
              {t(I18nKey.AUTOMATIONS$PROACTIVATION_CREATE_PR)}
            </button>
          </>
        )}
        {isDismissed && (
          <span className="text-xs text-muted">
            {t(I18nKey.AUTOMATIONS$PROACTIVATION_DISMISSED)}
          </span>
        )}
        {canCancel && (
          <button
            type="button"
            onClick={handleCancelClick}
            disabled={isCancelling}
            aria-busy={isCancelling}
            className="rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-raised hover:text-danger disabled:opacity-60"
            title={t(I18nKey.AUTOMATIONS$DETAIL$CANCEL_RUN_HINT)}
          >
            {isCancelling
              ? t(I18nKey.AUTOMATIONS$DETAIL$CANCELLING_RUN)
              : t(I18nKey.AUTOMATIONS$DETAIL$CANCEL_RUN)}
          </button>
        )}
        {logsButton}
        {guardCancel ? (
          <span
            data-testid="run-guard-cancelled"
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--oh-warning)]/50 bg-[var(--oh-warning)]/10 px-2.5 py-1 text-xs font-medium text-[var(--oh-warning)]"
          >
            {t(GUARD_CANCEL_LABELS[guardCancel.reason])}
          </span>
        ) : shouldShowOutcome(outcome, run) ? (
          <RunOutcomeChip outcome={outcome} run={run} />
        ) : isRateLimitFailure ? (
          <StyledTooltip content={run.error_detail ?? ""} placement="top">
            <span
              data-testid="run-rate-limit-failed"
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--oh-danger)]/50 bg-[var(--oh-danger)]/10 px-2.5 py-1 text-xs font-medium text-danger"
            >
              {t(I18nKey.AUTOMATIONS$DETAIL$RATE_LIMIT_FAILED)}
            </span>
          </StyledTooltip>
        ) : (
          <RunStatusBadge status={run.status} />
        )}
      </div>
    </>
  );

  return (
    <>
      {hasConversation && run.conversation_id ? (
        <a
          href={getConversationUrl(run.conversation_id)}
          className="flex items-center justify-between px-5 py-3 transition-colors cursor-pointer hover:bg-surface-raised focus:bg-surface-raised focus:outline-none"
          aria-label={t(I18nKey.AUTOMATIONS$DETAIL$VIEW_RUN_CONVERSATION, {
            timestamp: formattedTimestamp,
          })}
        >
          {content}
        </a>
      ) : (
        <div className="flex items-center justify-between px-5 py-3 cursor-default">
          {content}
        </div>
      )}
      <RunReportPreview
        text={report?.text ?? null}
        error={failureLine}
        errorKind={report?.error?.kind ?? null}
      />

      {hasBashCommand && (
        <RunLogsModal
          conversationId={run.conversation_id}
          bashCommandId={run.bash_command_id}
          isOpen={logsOpen}
          onClose={() => setLogsOpen(false)}
          run={run}
          automation={automation}
        />
      )}

      <DismissReasonModal
        isOpen={isDismissModalOpen}
        onCancel={() => setIsDismissModalOpen(false)}
        onConfirm={handleDismissConfirm}
      />
    </>
  );
}
