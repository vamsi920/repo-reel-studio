/**
 * Background activity events for CodeGraph.
 *
 * Graph generation is background work, so it reports progress as product-level
 * milestones — "analyzing repository", "graph ready" — never as a stream of
 * low-level noise. Emitting one event per node or per parsed file would make
 * the activity feed useless, so the emitter exposes only the milestones below.
 *
 * The event shape is the platform-wide `WorkspaceActivityEvent` contract, which
 * now lives in `src/lib/activity/workspace-activity.ts` because AgentOps
 * produces it too. It is re-exported here so existing CodeGraph imports keep
 * working unchanged.
 */

import {
  publishWorkspaceActivity,
  subscribeToWorkspaceActivity,
  clearWorkspaceActivitySubscribers,
  type WorkspaceActivityEvent,
  type WorkspaceActivitySource,
  type WorkspaceActivityStatus,
} from "#/lib/activity/workspace-activity";

export type {
  WorkspaceActivityEvent,
  WorkspaceActivitySource,
  WorkspaceActivityStatus,
};

export const subscribeToCodeGraphActivity = subscribeToWorkspaceActivity;

/** Reset hook for tests; not used by application code. */
export const clearCodeGraphActivitySubscribers =
  clearWorkspaceActivitySubscribers;

let sequence = 0;

function nextId(): string {
  sequence += 1;
  return `codegraph-${sequence}`;
}

export interface CodeGraphActivityContext {
  workspaceId: string;
  repositoryId: string;
  commitSha: string;
}

/**
 * The complete set of milestones CodeGraph reports. Adding a case here is a
 * deliberate product decision — anything finer-grained belongs in a log, not
 * in the user's activity feed.
 */
export type CodeGraphMilestone =
  | { kind: "analysis.started" }
  | { kind: "analysis.relationships" }
  | { kind: "analysis.mapped"; fileCount: number; symbolCount: number }
  | { kind: "analysis.ready"; subsystemCount: number; reduced?: boolean }
  | { kind: "analysis.failed"; reason: string };

function describe(milestone: CodeGraphMilestone): {
  status: WorkspaceActivityStatus;
  title: string;
  message?: string;
  progress?: number;
} {
  switch (milestone.kind) {
    case "analysis.started":
      return {
        status: "running",
        title: "CodeGraph: analyzing repository",
        progress: 10,
      };
    case "analysis.relationships":
      return {
        status: "running",
        title: "CodeGraph: building relationships",
        progress: 55,
      };
    case "analysis.mapped":
      return {
        status: "running",
        title: `CodeGraph: mapped ${milestone.fileCount.toLocaleString()} files and ${milestone.symbolCount.toLocaleString()} symbols`,
        progress: 85,
      };
    case "analysis.ready":
      return {
        status: "completed",
        title: "CodeGraph: graph ready",
        message: milestone.reduced
          ? `${milestone.subsystemCount} subsystems (reduced analysis)`
          : `${milestone.subsystemCount} subsystems`,
        progress: 100,
      };
    case "analysis.failed":
      return {
        status: "failed",
        title: "CodeGraph: analysis failed",
        message: milestone.reason,
      };
    default: {
      // Exhaustiveness guard — a new milestone must define its copy above.
      const never: never = milestone;
      throw new Error(
        `Unhandled CodeGraph milestone: ${JSON.stringify(never)}`,
      );
    }
  }
}

export function emitCodeGraphMilestone(
  context: CodeGraphActivityContext,
  milestone: CodeGraphMilestone,
  now: string = new Date().toISOString(),
): WorkspaceActivityEvent {
  const { status, title, message, progress } = describe(milestone);
  const event: WorkspaceActivityEvent = {
    id: nextId(),
    workspaceId: context.workspaceId,
    source: "codegraph",
    kind: milestone.kind,
    status,
    title,
    ...(message ? { message } : {}),
    ...(progress !== undefined ? { progress } : {}),
    entityType: "repository",
    entityId: context.repositoryId,
    metadata: { commitSha: context.commitSha },
    createdAt: now,
  };
  publishWorkspaceActivity(event);
  return event;
}
