import { useEffect, useRef } from "react";
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
  const { data: audit } = useAgentOpsAudit();
  const published = useRef(new Set<string>());

  useEffect(() => {
    if (!audit?.length) return;
    // Audit ids are stable and append-only, so a seen-set is enough to keep
    // repeated polls from re-publishing the same milestone.
    publishAgentOpsActivity(audit, published.current);
  }, [audit]);
}
