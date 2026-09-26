import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useEventStore } from "#/stores/use-event-store";
import { useSkillInstallBannerStore } from "#/stores/skill-install-banner-store";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { detectSkillInstalls } from "#/utils/skill-install-events";
import { SKILLS_QUERY_KEYS } from "#/hooks/query/query-keys";

/**
 * Skill installs performed by the agent in this conversation (via the
 * bundled add-skill flow), minus the ones the user dismissed. The event
 * store is global, so results are scoped to the conversation it currently
 * holds — a mismatched id (remount race) yields no installs.
 *
 * A newly detected install also invalidates the cached `useSkills()` catalog
 * for the active backend, so navigating to the Skills page picks up the
 * freshly written skill immediately instead of serving up to 10 minutes of
 * stale data (or requiring a hard error-retry).
 */
export const useSkillInstalls = (conversationId: string | null | undefined) => {
  const events = useEventStore((s) => s.events);
  const loadedConversationId = useEventStore((s) => s.loadedConversationId);
  const dismissedEventIds = useSkillInstallBannerStore(
    (s) => s.dismissedEventIds,
  );
  const dismiss = useSkillInstallBannerStore((s) => s.dismiss);
  const { backend } = useActiveBackend();
  const queryClient = useQueryClient();

  const rawInstalls = useMemo(() => {
    if (!conversationId || conversationId !== loadedConversationId) return [];
    return detectSkillInstalls(events);
  }, [conversationId, loadedConversationId, events]);

  const seenEventIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const hasNewInstall = rawInstalls.some(
      (install) => !seenEventIdsRef.current.has(install.eventId),
    );
    rawInstalls.forEach((install) =>
      seenEventIdsRef.current.add(install.eventId),
    );
    if (hasNewInstall) {
      queryClient.invalidateQueries({
        queryKey: SKILLS_QUERY_KEYS.all(backend.id),
      });
    }
  }, [rawInstalls, queryClient, backend.id]);

  const installs = useMemo(
    () => rawInstalls.filter((install) => !dismissedEventIds[install.eventId]),
    [rawInstalls, dismissedEventIds],
  );

  const dismissAll = useCallback(
    () => dismiss(installs.map((install) => install.eventId)),
    [dismiss, installs],
  );

  return { installs, dismissAll };
};
