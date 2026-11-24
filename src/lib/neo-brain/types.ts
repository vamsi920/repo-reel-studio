/**
 * Neo Brain domain model.
 *
 * The brain is the learning loop on top of workspace memory: every correction
 * a user makes and every recovery a run proves is routed to one layer, then
 * either stored straight away (the user said it, or an exit code proved it)
 * or held for review (Neo inferred it). Storage stays in workspace memory;
 * nothing here persists a record on its own.
 */
import type { MemoryCandidate, MemoryKind } from "#/lib/workspace-memory/types";

/**
 * Where a learning belongs. Mirrors the routing table of a company brain:
 * a missing fact, a strategic choice, a repeated preference, a technique,
 * a sequence that failed and its fix, and an action that needs a gate.
 */
export type BrainLayer =
  | "fact"
  | "decision"
  | "policy"
  | "convention"
  | "skill"
  | "gate"
  | "failure";

export const BRAIN_LAYERS: readonly BrainLayer[] = [
  "gate",
  "decision",
  "policy",
  "convention",
  "skill",
  "failure",
  "fact",
];

export const LAYER_TO_KIND: Record<BrainLayer, MemoryKind> = {
  fact: "fact",
  decision: "decision",
  policy: "policy",
  convention: "convention",
  skill: "procedure",
  gate: "constraint",
  failure: "failure",
};

export const KIND_TO_LAYER: Partial<Record<MemoryKind, BrainLayer>> = {
  fact: "fact",
  decision: "decision",
  policy: "policy",
  convention: "convention",
  procedure: "skill",
  constraint: "gate",
  failure: "failure",
  "business-rule": "policy",
};

export interface BrainLearning {
  /** Same as `key`: one learning per claim, however often it is heard. */
  id: string;
  key: string;
  layer: BrainLayer;
  candidate: MemoryCandidate;
  /** `true` when Neo inferred it; a person must approve it first. */
  needsReview: boolean;
  /** The user's sentence or the commands that justified it. */
  evidence: string;
  createdAt: string;
}

/** How often a claim was heard, across distinct conversations. */
export interface BrainSighting {
  conversations: string[];
  firstSeen: string;
  lastSeen: string;
}
