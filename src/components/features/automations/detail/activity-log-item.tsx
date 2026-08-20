import { useState } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import TerminalIcon from "#/icons/terminal.svg?react";
import {
  AutomationRunStatus,
  type Automation,
  type AutomationRun,
} from "#/types/automation";
import { RunStatusBadge } from "./run-status-badge";
import { RunLogsModal } from "./run-logs-modal";
import { parseProactivationMarker } from "#/utils/proactivation-prompt";
import { getCreatePRPrompt } from "#/utils/utils";
import { setConversationState } from "#/utils/conversation-local-storage";
import { useNavigation } from "#/context/navigation-context";
import { useWorkspaceMemoryStore } from "#/stores/workspace-memory-store";
import { submitMemoryCandidate } from "#/lib/workspace-memory/memory-updater";
import { BrandButton } from "#/components/features/settings/brand-button";

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onCancel}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        role="presentation"
      />
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
    </div>
  );
}

export function ActivityLogItem({ run, automation }: ActivityLogItemProps) {
  const { t, i18n } = useTranslation("openhands");
  const { navigate } = useNavigation();
  const activeWorkspaceId = useWorkspaceMemoryStore((s) => s.activeWorkspaceId);
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
  const [isDismissed, setIsDismissed] = useState(false);
  const [isDismissModalOpen, setIsDismissModalOpen] = useState(false);

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
    setIsDismissed(true);
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
        {logsButton}
        <RunStatusBadge status={run.status} />
      </div>
    </>
  );

  return (
    <>
      {hasConversation && run.conversation_id ? (
        <a
          href={getConversationUrl(run.conversation_id)}
          className="flex items-center justify-between px-5 py-3 transition-colors cursor-pointer hover:bg-surface-raised focus:bg-surface-raised focus:outline-none"
          aria-label={`View conversation for run at ${formattedTimestamp}`}
        >
          {content}
        </a>
      ) : (
        <div className="flex items-center justify-between px-5 py-3 cursor-default">
          {content}
        </div>
      )}

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
