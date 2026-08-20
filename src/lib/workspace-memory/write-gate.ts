/**
 * The write gate is the reason agents cannot fill permanent memory with
 * whatever they happened to think. A candidate only becomes durable when it
 * is grounded in something checkable; everything else stays caller-owned
 * session state.
 *
 * It also refuses to persist reasoning. Callers submit conclusions --
 * "payments talks gRPC", "the test command is `npm test`" -- never the
 * deliberation that produced them.
 */
import { detectSensitivePath, estimateTokens } from "#/lib/layman";

import type {
  MemoryCandidate,
  MemoryKind,
  MemoryRecord,
  ProvenanceSource,
} from "./types";

export const MAX_STATEMENT_CHARS = 2000;
const MIN_STATEMENT_CHARS = 8;

/**
 * Sources that are authoritative on their own: a human said it, a document
 * said it, or a run actually produced it.
 */
const SELF_GROUNDING_SOURCES: ReadonlySet<ProvenanceSource> = new Set([
  "user-decision",
  "approved-requirement",
  "uploaded-document",
  "verified-agent-result",
  "pr-outcome",
  "test-result",
  "incident",
  "sme-validated",
  "knowledge-reference",
]);

/** Sources that must point at a specific place in the repository. */
const ANCHOR_REQUIRED_SOURCES: ReadonlySet<ProvenanceSource> = new Set([
  "repository-evidence",
]);

/**
 * Phrasings that signal deliberation rather than a conclusion. Cheap and
 * deliberately conservative: a rejected candidate costs nothing, a persisted
 * hallucination costs every future prompt.
 */
const REASONING_MARKERS = [
  /\bi (?:think|believe|guess|suspect|wonder)\b/i,
  /\b(?:maybe|perhaps|probably|possibly|might be|could be|not sure)\b/i,
  /\blet(?:'s| us) (?:try|check|see)\b/i,
  /\bi(?:'m| am) going to\b/i,
  /\bnext,? i(?:'ll| will)\b/i,
];

export type WriteGateReason =
  | "grounded"
  | "ungrounded-agent-claim"
  | "missing-repository-anchor"
  | "sensitive-path"
  | "reasoning-not-outcome"
  | "too-long"
  | "too-short"
  | "duplicate"
  | "missing-workspace-id";

export interface WriteGateVerdict {
  accepted: boolean;
  reason: WriteGateReason;
  /** Present only when `accepted`: the normalized, ready-to-store record. */
  record?: MemoryRecord;
}

export function normalizeSubject(subject: string): string {
  return subject.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 120);
}

function normalizeStatement(statement: string): string {
  return statement.trim().replace(/\s+/g, " ");
}

/** Stable content key for dedupe. */
function contentKey(
  kind: MemoryKind,
  subject: string,
  statement: string,
): string {
  return `${kind} ${normalizeSubject(subject)} ${normalizeStatement(
    statement,
  ).toLowerCase()}`;
}

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID)
    return crypto.randomUUID();
  return `mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function isGrounded(candidate: MemoryCandidate): boolean {
  const { source, filePath, commitSha, eventId, sourceId } =
    candidate.provenance;
  if (SELF_GROUNDING_SOURCES.has(source)) return true;
  if (ANCHOR_REQUIRED_SOURCES.has(source)) {
    return Boolean(filePath && (commitSha || eventId || sourceId));
  }
  // "agent-claim" and anything unrecognized: never durable on its own.
  return false;
}

function clampConfidence(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0.8;
  return Math.min(1, Math.max(0, value));
}

export function evaluateWrite(
  candidate: MemoryCandidate,
  existing: readonly MemoryRecord[],
): WriteGateVerdict {
  if (!candidate.workspaceId?.trim()) {
    return { accepted: false, reason: "missing-workspace-id" };
  }

  const statement = normalizeStatement(candidate.statement ?? "");
  if (statement.length < MIN_STATEMENT_CHARS) {
    return { accepted: false, reason: "too-short" };
  }
  if (statement.length > MAX_STATEMENT_CHARS) {
    return { accepted: false, reason: "too-long" };
  }
  if (REASONING_MARKERS.some((pattern) => pattern.test(statement))) {
    return { accepted: false, reason: "reasoning-not-outcome" };
  }

  const { filePath } = candidate.provenance;
  if (filePath && detectSensitivePath(filePath).matched) {
    return { accepted: false, reason: "sensitive-path" };
  }

  if (!isGrounded(candidate)) {
    return {
      accepted: false,
      reason: ANCHOR_REQUIRED_SOURCES.has(candidate.provenance.source)
        ? "missing-repository-anchor"
        : "ungrounded-agent-claim",
    };
  }

  const subject = normalizeSubject(candidate.subject);
  const key = contentKey(candidate.kind, subject, statement);
  const isDuplicate = existing.some(
    (record) =>
      record.status !== "superseded" &&
      contentKey(record.kind, record.subject, record.statement) === key,
  );
  if (isDuplicate) {
    return { accepted: false, reason: "duplicate" };
  }

  const now = new Date().toISOString();
  return {
    accepted: true,
    reason: "grounded",
    record: {
      id: newId(),
      workspaceId: candidate.workspaceId,
      kind: candidate.kind,
      subject,
      statement,
      tags: candidate.tags?.map((tag) => tag.trim()).filter(Boolean) ?? [],
      provenance: { ...candidate.provenance, grounded: true },
      status: "active",
      confidence: clampConfidence(candidate.confidence),
      createdAt: now,
      supersededAt: null,
      supersededById: null,
      conflictsWith: [],
      pinned: candidate.pinned ?? false,
      tokenCost: estimateTokens(statement),
    },
  };
}
