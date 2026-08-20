/**
 * Workspace memory domain model.
 *
 * Every durable record is scoped to exactly one workspace and carries the
 * provenance that justified persisting it. There is deliberately no
 * cross-workspace or "global" record: isolation is a property of the type,
 * not of a runtime check that someone can forget.
 */

/** What kind of thing a record asserts. Drives selection weighting. */
export type MemoryKind =
  | "fact"
  | "decision"
  | "business-rule"
  | "constraint"
  | "policy"
  | "convention"
  | "outcome"
  | "failure"
  | "procedure";

/**
 * `superseded` records are never deleted — a fact that changed stays
 * traceable back through `supersededById`. `conflicted` means two grounded
 * sources disagreed and neither could be preferred on recency or authority.
 */
export type MemoryStatus = "active" | "superseded" | "conflicted";

/**
 * Where a candidate came from. The write gate keys off this: only sources
 * that can be anchored to something checkable are allowed to persist.
 */
export type ProvenanceSource =
  | "user-decision"
  | "approved-requirement"
  | "uploaded-document"
  | "repository-evidence"
  | "verified-agent-result"
  | "pr-outcome"
  | "test-result"
  | "incident"
  | "sme-validated"
  | "knowledge-reference"
  | "agent-claim";

export interface MemoryProvenance {
  source: ProvenanceSource;
  /** Human-readable id of the originating artifact (PR number, doc name, run id). */
  sourceId?: string;
  conversationId: string | null;
  eventId?: string;
  repositoryId?: string;
  commitSha?: string;
  filePath?: string;
  symbol?: string;
  /** ISO 8601. Ordering key for supersession — not `createdAt`, which is write time. */
  observedAt: string;
  /**
   * Set by the write gate, never by the caller. `false` means the record may
   * live in session memory but must not be persisted.
   */
  grounded: boolean;
}

export interface MemoryRecord {
  id: string;
  workspaceId: string;
  kind: MemoryKind;
  /**
   * Normalized supersession/dedupe key, e.g. `payments:transport`. Two records
   * with the same (kind, subject) are two versions of the same claim.
   */
  subject: string;
  statement: string;
  tags: string[];
  provenance: MemoryProvenance;
  status: MemoryStatus;
  confidence: number;
  createdAt: string;
  supersededAt: string | null;
  supersededById: string | null;
  conflictsWith: string[];
  pinned: boolean;
  /** `estimateTokens(statement)` cached at write time so selection stays cheap. */
  tokenCost: number;
}

/** What callers submit. The gate decides whether it becomes a `MemoryRecord`. */
export interface MemoryCandidate {
  workspaceId: string;
  kind: MemoryKind;
  subject: string;
  statement: string;
  tags?: string[];
  confidence?: number;
  pinned?: boolean;
  provenance: Omit<MemoryProvenance, "grounded">;
}

export interface WorkspaceActivityEvent {
  id: string;
  workspaceId: string;
  at: string;
  kind:
    | "learned"
    | "superseded"
    | "conflicted"
    | "rejected"
    | "mirrored"
    | "mirror-failed"
    | "cache-refreshed";
  summary: string;
}
