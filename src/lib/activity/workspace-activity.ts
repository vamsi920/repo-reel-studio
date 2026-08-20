/**
 * The platform-wide workspace activity contract.
 *
 * This type and its publish/subscribe seam started life inside CodeGraph
 * (`src/lib/codegraph/activity.ts`), which declared the whole `source` union —
 * including `"agentops"` — against the day a second producer existed. AgentOps
 * is that producer, so the contract now lives here and CodeGraph re-exports it;
 * no CodeGraph call site changed.
 *
 * `publish()` still fans out to in-process subscribers. When a shared
 * server-side activity service lands, only `publish()` changes.
 */

export type WorkspaceActivitySource =
  | "sme"
  | "knowledge"
  | "codegraph"
  | "memory"
  | "agentops"
  | "automation"
  | "security"
  | "system";

export type WorkspaceActivityStatus =
  | "queued"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "info";

export interface WorkspaceActivityEvent {
  id: string;
  workspaceId: string;
  source: WorkspaceActivitySource;
  kind: string;
  status: WorkspaceActivityStatus;
  title: string;
  message?: string;
  /** 0-100. */
  progress?: number;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

type Subscriber = (event: WorkspaceActivityEvent) => void;

const subscribers = new Set<Subscriber>();

/** The single seam between feature code and the platform activity system. */
export function publishWorkspaceActivity(event: WorkspaceActivityEvent): void {
  subscribers.forEach((subscriber) => subscriber(event));
}

export function subscribeToWorkspaceActivity(
  subscriber: Subscriber,
): () => void {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

/** Reset hook for tests; not used by application code. */
export function clearWorkspaceActivitySubscribers(): void {
  subscribers.clear();
}
