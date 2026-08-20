/**
 * AgentOps → Workspace Activity.
 *
 * The collector's audit log is the record of what happened; the activity feed
 * is the product-level view of it. Not every audit record deserves a feed
 * entry — a run that made 200 tool calls would drown everything else — so this
 * maps only the milestones a person would want surfaced, the same editorial
 * rule CodeGraph applies in `src/lib/codegraph/activity.ts`.
 */

import type { AgentOpsAuditRecord } from "#/api/agentops-service/agentops-service.types";
import {
  publishWorkspaceActivity,
  type WorkspaceActivityEvent,
  type WorkspaceActivityStatus,
} from "./workspace-activity";

/** Audit actions that become activity-feed entries, and how they read. */
const FEED_ACTIONS: Record<string, WorkspaceActivityStatus> = {
  "task.started": "running",
  "task.completed": "completed",
  "task.failed": "failed",
  "approval.requested": "waiting",
  "approval.granted": "info",
  "approval.rejected": "info",
  "budget.warning": "info",
  "budget.exceeded": "failed",
  "run.paused": "info",
  "run.resumed": "running",
  "run.cancel": "info",
};

export function toWorkspaceActivityEvent(
  record: AgentOpsAuditRecord,
): WorkspaceActivityEvent | null {
  const status = FEED_ACTIONS[record.action];
  if (!status) return null;

  return {
    id: `agentops-${record.id}`,
    workspaceId: record.workspaceId ?? "unknown",
    source: "agentops",
    kind: record.action,
    status,
    title: record.summary,
    entityType: record.entityType,
    entityId: record.entityId,
    ...(record.metadata ? { metadata: record.metadata } : {}),
    createdAt: record.at,
  };
}

/**
 * Publish any newly-seen audit records to the activity feed.
 *
 * The collector is polled, so the same records come back every tick; the caller
 * owns the `published` set that makes this idempotent.
 */
export function publishAgentOpsActivity(
  records: AgentOpsAuditRecord[],
  published: Set<string>,
): WorkspaceActivityEvent[] {
  const emitted: WorkspaceActivityEvent[] = [];
  for (const record of records) {
    if (published.has(record.id)) continue;
    published.add(record.id);
    const event = toWorkspaceActivityEvent(record);
    if (!event) continue;
    publishWorkspaceActivity(event);
    emitted.push(event);
  }
  return emitted;
}
