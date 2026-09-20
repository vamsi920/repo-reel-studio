import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { AgentState } from "#/types/agent-state";
import { ActionTooltip } from "../action-tooltip";
import { RiskAlert } from "#/components/shared/risk-alert";
import WarningIcon from "#/icons/u-warning.svg?react";
import { useEventMessageStore } from "#/stores/event-message-store";
import { useEventStore, type OHEvent } from "#/stores/use-event-store";
import { isActionEvent } from "#/types/agent-server/type-guards";
import type { ActionEvent } from "#/types/agent-server/core/events/action-event";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useAgentState } from "#/hooks/use-agent-state";
import { useRespondToConfirmation } from "#/hooks/mutation/use-respond-to-confirmation";
import { SecurityRisk } from "#/types/agent-server/core/base/common";

/**
 * The action the agent is blocked on, if any. Must be the most recent
 * agent-authored *action* specifically — not just the most recent
 * agent-sourced event — because non-action agent events (a streaming text
 * delta, the system prompt, an ACP tool call) carry no `security_risk` and
 * would make a real high-risk pending action read as unknown/low risk if
 * picked instead.
 */
export function findAwaitingConfirmationAction(
  events: OHEvent[],
): ActionEvent | undefined {
  return events
    .slice()
    .reverse()
    .find(
      (ev): ev is ActionEvent => ev.source === "agent" && isActionEvent(ev),
    );
}

export function ConversationConfirmationButtons() {
  const submittedEventIds = useEventMessageStore(
    (state) => state.submittedEventIds,
  );
  const addSubmittedEventId = useEventMessageStore(
    (state) => state.addSubmittedEventId,
  );

  const { t } = useTranslation("openhands");
  const { data: conversation } = useActiveConversation();
  const { curAgentState } = useAgentState();
  const { mutate: respondToConfirmation } = useRespondToConfirmation();
  const events = useEventStore((state) => state.events);

  const awaitingAction = findAwaitingConfirmationAction(events);

  const handleConfirmation = useCallback(
    (accept: boolean) => {
      if (
        !awaitingAction ||
        !conversation ||
        curAgentState !== AgentState.AWAITING_USER_CONFIRMATION ||
        submittedEventIds.includes(awaitingAction.id ?? "")
      ) {
        return;
      }

      // Mark event as submitted to prevent duplicate submissions
      if (awaitingAction.id) {
        addSubmittedEventId(awaitingAction.id);
      }

      // Call the agent-server API endpoint
      respondToConfirmation({
        conversationId: conversation.id,
        conversationUrl: conversation.conversation_url || "",
        sessionApiKey: conversation.session_api_key,
        accept,
      });
    },
    [
      awaitingAction,
      conversation,
      curAgentState,
      submittedEventIds,
      addSubmittedEventId,
      respondToConfirmation,
    ],
  );

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!awaitingAction) {
      return undefined;
    }

    const handleCancelShortcut = (event: KeyboardEvent) => {
      if (event.shiftKey && event.metaKey && event.key === "Backspace") {
        event.preventDefault();
        handleConfirmation(false);
      }
    };

    const handleContinueShortcut = (event: KeyboardEvent) => {
      if (event.metaKey && event.key === "Enter") {
        event.preventDefault();
        handleConfirmation(true);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // Cancel: Shift+Cmd+Backspace (⇧⌘⌫)
      handleCancelShortcut(event);
      // Continue: Cmd+Enter (⌘↩)
      handleContinueShortcut(event);
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [awaitingAction, handleConfirmation]);

  // Only show if agent is waiting for confirmation and we haven't already submitted
  if (
    curAgentState !== AgentState.AWAITING_USER_CONFIRMATION ||
    !awaitingAction ||
    submittedEventIds.includes(awaitingAction.id ?? "")
  ) {
    return null;
  }

  const isHighRisk = awaitingAction.security_risk === SecurityRisk.HIGH;

  return (
    <div className="flex flex-col gap-2 pt-4">
      {isHighRisk && (
        <RiskAlert
          content={t(I18nKey.CHAT_INTERFACE$HIGH_RISK_WARNING)}
          icon={<WarningIcon width={16} height={16} color="#fff" />}
          severity="high"
          title={t(I18nKey.COMMON$HIGH_RISK)}
        />
      )}
      <div className="flex justify-between items-center">
        <p className="text-sm font-normal text-white">
          {t(I18nKey.CHAT_INTERFACE$USER_ASK_CONFIRMATION)}
        </p>
        <div className="flex items-center gap-3">
          <ActionTooltip
            type="reject"
            onClick={() => handleConfirmation(false)}
          />
          <ActionTooltip
            type="confirm"
            onClick={() => handleConfirmation(true)}
          />
        </div>
      </div>
    </div>
  );
}
