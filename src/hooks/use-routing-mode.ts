import { useCallback } from "react";
import { getStoredConversationMetadata } from "#/api/conversation-metadata-store";
import { useSaveSettings } from "#/hooks/mutation/use-save-settings";
import { useTracking } from "#/hooks/use-tracking";
import { resolveRoutingMode } from "#/lib/model-routing/prefs";
import { setConversationRoutingMode } from "#/lib/model-routing/runtime";
import type { RoutingMode } from "#/lib/model-routing/types";
import { useModelRoutingStore } from "#/stores/model-routing-store";

/**
 * The effective Auto/manual mode for a conversation (chat override → global
 * default) and a setter that writes to the right scope: the chat when one is
 * open, the global `model_routing_mode` preference on the home page.
 */
// @spec MR-017 — Routing mode resolution
export function useRoutingMode(conversationId: string | null | undefined) {
  const conversationMode = useModelRoutingStore((s) =>
    conversationId ? s.modeByConversation[conversationId] : undefined,
  );
  const globalMode = useModelRoutingStore((s) => s.prefs.mode);
  const { mutate: saveSettings } = useSaveSettings();
  const { trackRoutingModeChanged } = useTracking();

  const routingMode = resolveRoutingMode(
    conversationMode ??
      (conversationId
        ? getStoredConversationMetadata(conversationId)?.routing_mode
        : null),
    globalMode,
  );

  const setRoutingMode = useCallback(
    (mode: RoutingMode) => {
      if (mode === routingMode) return;
      if (conversationId) {
        setConversationRoutingMode(conversationId, mode);
      } else {
        // Optimistic: the snapshot refreshes again once settings refetch.
        const state = useModelRoutingStore.getState();
        state.syncSnapshot({
          backendId: state.backendId ?? "",
          prefs: { ...state.prefs, mode },
          profiles: state.profiles,
        });
        saveSettings({ model_routing_mode: mode });
      }
      trackRoutingModeChanged({
        scope: conversationId ? "conversation" : "global",
        mode,
      });
    },
    [conversationId, routingMode, saveSettings, trackRoutingModeChanged],
  );

  return { routingMode, setRoutingMode };
}
