import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { registerCloudSyncedStore } from "#/lib/data-platform/cloud-state-sync";

export const ARCHIVED_CONVERSATIONS_STORAGE_KEY = "archived-conversations";

interface ArchivedConversationsState {
  archivesByBackendId: Record<string, string[]>;
}

interface ArchivedConversationsActions {
  archiveConversation: (backendId: string, conversationId: string) => void;
  removeArchivedConversation: (
    backendId: string,
    conversationId: string,
  ) => void;
  isArchived: (backendId: string, conversationId: string) => boolean;
}

type ArchivedConversationsStore = ArchivedConversationsState &
  ArchivedConversationsActions;

const initialState: ArchivedConversationsState = {
  archivesByBackendId: {},
};

function getArchivesForBackend(
  archivesByBackendId: Record<string, string[]>,
  backendId: string,
): string[] {
  return archivesByBackendId[backendId] ?? [];
}

export const useArchivedConversationsStore =
  create<ArchivedConversationsStore>()(
    persist(
      (set, get) => ({
        ...initialState,

        archiveConversation: (backendId, conversationId) => {
          const current = getArchivesForBackend(
            get().archivesByBackendId,
            backendId,
          );
          if (current.includes(conversationId)) {
            return;
          }
          set((state) => ({
            archivesByBackendId: {
              ...state.archivesByBackendId,
              [backendId]: [conversationId, ...current],
            },
          }));
        },

        removeArchivedConversation: (backendId, conversationId) => {
          const current = getArchivesForBackend(
            get().archivesByBackendId,
            backendId,
          );
          if (!current.includes(conversationId)) {
            return;
          }
          set((state) => ({
            archivesByBackendId: {
              ...state.archivesByBackendId,
              [backendId]: current.filter((id) => id !== conversationId),
            },
          }));
        },

        isArchived: (backendId, conversationId) =>
          getArchivesForBackend(get().archivesByBackendId, backendId).includes(
            conversationId,
          ),
      }),
      {
        name: ARCHIVED_CONVERSATIONS_STORAGE_KEY,
        storage: createJSONStorage(() => localStorage),
        partialize: (state): ArchivedConversationsState => ({
          archivesByBackendId: state.archivesByBackendId,
        }),
      },
    ),
  );

// A merged cloud copy (another browser, localhost or production) replaces
// the in-memory state.
registerCloudSyncedStore(ARCHIVED_CONVERSATIONS_STORAGE_KEY, () => {
  useArchivedConversationsStore.persist.rehydrate();
});
