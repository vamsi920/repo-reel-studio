/**
 * Security's contract with Workspace Activity.
 *
 * The event shape is the platform-wide `WorkspaceActivityEvent` already used by
 * CodeGraph (which reserves the `"security"` source). This module declares the
 * milestones Security will report and how they read, but deliberately does not
 * emit anything: there are no scans yet, and an activity feed showing scan
 * progress that never happened would be a lie. The emitter lands with the real
 * engine; call sites that build events can already type against this.
 */
import type {
  WorkspaceActivityEvent,
  WorkspaceActivityStatus,
} from "#/lib/codegraph/activity";

export type SecurityMilestoneKind =
  | "scan.started"
  | "dependencies.analyzed"
  | "findings.ready"
  | "remediation.verified"
  | "scan.failed";

export interface SecurityActivityContext {
  workspaceId: string;
  repositoryId: string;
  commitSha: string;
}

export const SECURITY_MILESTONE_COPY: Record<
  SecurityMilestoneKind,
  { status: WorkspaceActivityStatus; title: string }
> = {
  "scan.started": { status: "running", title: "Security: scan started" },
  "dependencies.analyzed": {
    status: "running",
    title: "Security: dependency analysis complete",
  },
  "findings.ready": { status: "completed", title: "Security: findings ready" },
  "remediation.verified": {
    status: "completed",
    title: "Security: remediation verified",
  },
  "scan.failed": { status: "failed", title: "Security: scan failed" },
};

/**
 * Builds — but does not publish — a Security activity event. Kept pure so the
 * contract is testable before any scanner exists; the real engine will hand
 * the result to the workspace activity emitter.
 */
export function buildSecurityActivityEvent(
  context: SecurityActivityContext,
  kind: SecurityMilestoneKind,
  createdAt: string,
  message?: string,
): WorkspaceActivityEvent {
  const { status, title } = SECURITY_MILESTONE_COPY[kind];
  return {
    id: `security-${context.repositoryId}-${kind}-${createdAt}`,
    workspaceId: context.workspaceId,
    source: "security",
    kind,
    status,
    title,
    ...(message ? { message } : {}),
    entityType: "repository",
    entityId: context.repositoryId,
    metadata: { commitSha: context.commitSha },
    createdAt,
  };
}
