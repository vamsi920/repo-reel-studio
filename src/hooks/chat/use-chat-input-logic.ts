import { useRef, useCallback, useEffect } from "react";
import {
  isContentEmpty,
  clearEmptyContent,
  getTextContent,
} from "#/components/features/chat/utils/chat-input.utils";
import { useConversationStore } from "#/stores/conversation-store";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import { useDraftPersistence } from "./use-draft-persistence";

/**
 * Hook for managing chat input content logic
 */
export const useChatInputLogic = () => {
  const chatInputRef = useRef<HTMLDivElement | null>(null);
  // Optional because the chat input also renders on the home page, where no
  // conversation route is mounted yet. Draft persistence is conversation-
  // scoped, so it no-ops when this is undefined.
  const { conversationId } = useOptionalConversationId();

  const {
    messageToSend: rawMessageToSend,
    messageRestoreIfEmpty,
    hasRightPanelToggled,
    setMessageToSend,
    clearMessageRestoreIfEmpty,
    setIsRightPanelShown,
  } = useConversationStore();

  // Draft persistence - saves to localStorage/sessionStorage, restores on mount
  const { saveDraft, clearDraft } = useDraftPersistence(
    conversationId,
    chatInputRef,
  );

  // On the home page (no conversationId) the right-panel / messageToSend
  // mechanism is not relevant.  More importantly, a stale messageToSend value
  // in the Zustand store causes useAutoResize to overwrite the just-restored
  // sessionStorage draft with an empty string (see useAutoResize value effect).
  // Returning null here keeps value=undefined in useAutoResize so it never
  // touches the element content on the home page.
  const messageToSend = conversationId ? rawMessageToSend : null;

  // Restore a cancelled pending send back into the input only when empty.
  useEffect(() => {
    if (!conversationId || !messageRestoreIfEmpty) {
      return;
    }

    const currentText = getTextContent(chatInputRef.current).trim();
    if (currentText.length === 0) {
      setMessageToSend(messageRestoreIfEmpty.text);
    }
    clearMessageRestoreIfEmpty();
  }, [
    conversationId,
    messageRestoreIfEmpty,
    setMessageToSend,
    clearMessageRestoreIfEmpty,
  ]);

  // Keep the right-panel visibility in sync with this conversation's toggle
  // state, on both a route change and a toggle change.
  useEffect(() => {
    if (!conversationId) return;
    setIsRightPanelShown(hasRightPanelToggled);
  }, [conversationId, hasRightPanelToggled, setIsRightPanelShown]);

  // Save the current input value into messageToSend right before the drawer
  // toggle shifts the layout, so that re-render doesn't lose what the user
  // had typed. This must NOT also fire on a bare conversationId change (a
  // route navigation): the composer element persists across navigation
  // (it isn't remounted per conversation), so "current" DOM text at that
  // instant is really leftover text from before the navigation, not
  // something worth saving for the newly-mounted conversation -- and
  // overwriting messageToSend with it raced with (and silently clobbered)
  // deferred composer prefills fired right after navigate(), such as
  // "Branch from here"'s window.setTimeout(() => setMessageToSend(...), 0).
  const prevKeyRef = useRef({ conversationId, hasRightPanelToggled });
  useEffect(() => {
    const prev = prevKeyRef.current;
    const sameConversation = prev.conversationId === conversationId;
    const toggleChanged = prev.hasRightPanelToggled !== hasRightPanelToggled;
    prevKeyRef.current = { conversationId, hasRightPanelToggled };

    if (!conversationId || !sameConversation || !toggleChanged) return;
    if (chatInputRef.current) {
      setMessageToSend(getTextContent(chatInputRef.current));
    }
  }, [conversationId, hasRightPanelToggled, setMessageToSend]);

  // Helper function to check if contentEditable is truly empty
  const checkIsContentEmpty = useCallback(
    (): boolean => isContentEmpty(chatInputRef.current),
    [],
  );

  // Helper function to properly clear contentEditable for placeholder display
  const clearEmptyContentHandler = useCallback((): void => {
    clearEmptyContent(chatInputRef.current);
  }, []);

  // Get current message text
  const getCurrentMessage = useCallback(
    (): string => getTextContent(chatInputRef.current),
    [],
  );

  return {
    chatInputRef,
    messageToSend,
    checkIsContentEmpty,
    clearEmptyContentHandler,
    getCurrentMessage,
    saveDraft,
    clearDraft,
  };
};
