import { useEffect, useRef } from "react";
import { usePaginatedConversations } from "#/hooks/query/use-paginated-conversations";
import {
  archiveConversationEvents,
  indexConversations,
} from "#/lib/data-platform/conversation-archive";

/** Conversations whose events are archived per list refresh. */
const ARCHIVE_PER_PASS = 5;

/**
 * Indexes the chats of the active agent-server and archives their new events
 * to Supabase on every list refresh, so they show up (with transcript) on the
 * user's other environments.
 */
export function useConversationArchiveSync() {
  const { data } = usePaginatedConversations();
  const archivedAt = useRef(new Map<string, string>());

  useEffect(() => {
    const items = data?.pages.flatMap((page) => page.items) ?? [];
    if (items.length === 0) return undefined;
    indexConversations(items).catch(() => {});
    const changed = items
      .filter((c) => archivedAt.current.get(c.id) !== c.updated_at)
      .slice(0, ARCHIVE_PER_PASS);
    let cancelled = false;
    (async () => {
      for (const conversation of changed) {
        if (cancelled) return;
        try {
          await archiveConversationEvents(conversation);
          archivedAt.current.set(conversation.id, conversation.updated_at);
        } catch {
          // retried on the next refresh
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data]);
}
