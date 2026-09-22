import { useEffect, useRef } from "react";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useAgentOpsAudit } from "#/hooks/query/use-agentops";
import { publishAgentOpsActivity } from "#/lib/activity/agentops-activity";

/**
 * Bridges the collector's audit log into the workspace activity feed while an
 * AgentOps surface is mounted.
 *
 * Deliberately mount-scoped rather than app-global: the activity feed's own
 * server-side service doesn't exist yet (see
 * `src/lib/activity/workspace-activity.ts`), so a global subscription would
 * poll the collector on every page for no consumer.
 */
export function useAgentOpsWorkspaceActivity(): void {
  const { backend } = useActiveBackend();
  const { data: audit } = useAgentOpsAudit();
  const published = useRef(new Set<string>());
  const publishedBackendId = useRef(backend.id);

  // `useAgentOpsAudit`'s query key is scoped by backend id, so switching the
  // active local backend mid-session correctly refetches the new backend's
  // audit log. But its ids (e.g. the JSONL store's
  // `${entityId}:${action}:${at}:${arrayIndex}`) are not globally unique
  // across separate collector processes — carrying the old backend's seen-set
  // over could silently drop a coincidentally-id-colliding record from the
  // new backend's activity feed. Reset the dedup set on every backend switch.
  if (publishedBackendId.current !== backend.id) {
    publishedBackendId.current = backend.id;
    published.current = new Set<string>();
  }

  useEffect(() => {
    if (!audit?.length) return;
    // Audit ids are stable and append-only, so a seen-set is enough to keep
    // repeated polls from re-publishing the same milestone.
    publishAgentOpsActivity(audit, published.current);
  }, [audit]);
}
