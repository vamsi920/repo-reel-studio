import { useCallback, useRef } from "react";
import { useNavigation } from "#/context/navigation-context";
import { useConversationStore } from "#/stores/conversation-store";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import {
  setConversationState,
  setPendingTaskDraft,
} from "#/utils/conversation-local-storage";

export function useLaunchSkillInChat() {
  const { navigate } = useNavigation();
  const createConversation = useCreateConversation();
  const setMessageToSend = useConversationStore(
    (state) => state.setMessageToSend,
  );
  const launchInFlightRef = useRef(false);

  return useCallback(
    (message: string, onClose?: () => void) => {
      if (launchInFlightRef.current) return;
      launchInFlightRef.current = true;

      // use-chat-input-logic.ts only honors `messageToSend` once a
      // conversationId exists (it treats the field as stale on the home
      // page, see its own comment), so a conversation must be created
      // first -- the same sequence RecommendedAutomationsLauncher uses to
      // launch straight into a fresh conversation with a seeded message.
      //
      // `onClose` is deliberately NOT called until the mutation settles:
      // this hook is instantiated inside the modal that owns `onClose`, so
      // closing it early unmounts that hook instance and silently drops
      // the onSuccess callback below before it can navigate/seed the draft.
      createConversation.mutate(
        {},
        {
          onSuccess: (conversation) => {
            if (
              conversation.conversation_id.startsWith("task-") &&
              conversation.task_id
            ) {
              setPendingTaskDraft(conversation.task_id, message);
            } else {
              setConversationState(conversation.conversation_id, {
                draftMessage: message,
              });
            }
            navigate(`/conversations/${conversation.conversation_id}`);
            onClose?.();
            window.setTimeout(() => {
              setMessageToSend(message);
              launchInFlightRef.current = false;
            }, 0);
          },
          onError: () => {
            onClose?.();
            launchInFlightRef.current = false;
          },
        },
      );
    },
    [createConversation, navigate, setMessageToSend],
  );
}
