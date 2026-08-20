/**
 * Public API of workspace memory.
 *
 * SME, OpenHands, AgentOps, Proactive and Knowledge consume memory through
 * exactly two calls and never touch storage: `submitMemoryCandidate` to teach
 * it something, `WorkspaceContextService.buildContext` to use what it knows.
 * Keeping producers off the storage modules is what lets the durable layer
 * change (workspace file today, a server tomorrow) without touching them.
 */
export { default as WorkspaceContextService } from "./workspace-context-service";
export {
  bumpMemoryRevision,
  getMemoryRevision,
  resetRecordSource,
  setRecordSource,
  taskBucket,
  watchWorkspaceForInvalidation,
} from "./workspace-context-service";
export type {
  BuildContextParams,
  WorkspaceContext,
} from "./workspace-context-service";

export {
  drain as drainMemoryUpdater,
  getQueueDepth,
  resetMemoryUpdater,
  setActivitySink,
  submitMemoryCandidate,
} from "./memory-updater";

export { computeWorkspaceId, normalizeWorkspacePath } from "./workspace-id";

export { listKnownWorkspaceIds } from "#/api/workspace-memory/workspace-memory-store.api";

export { commandCandidate, isMemorableCommand } from "./observe-events";
export type { ObservedCommand, ObserveContext } from "./observe-events";

export {
  evaluateWrite,
  normalizeSubject,
  MAX_STATEMENT_CHARS,
} from "./write-gate";
export type { WriteGateReason, WriteGateVerdict } from "./write-gate";

export { applyTemporalSupersede, CONFLICT_WINDOW_MS } from "./supersede";

export { selectRecords, scoreRecord } from "./selection";
export type { SelectedRecord, SelectionResult } from "./selection";

export {
  containsMemoryBlock,
  renderContextBlock,
  MEMORY_BLOCK_END,
  MEMORY_BLOCK_START,
} from "./render";

export {
  aggregateSavings,
  estimateCostUsd,
  filterSamplesForMonth,
  tokensAvoided,
} from "./savings";
export type { SavingsCost, SavingsSample, SavingsSummary } from "./savings";

export { isPricingKnown, lookupModelPricing } from "./model-pricing";
export type { ModelPricing } from "./model-pricing";

export type {
  MemoryCandidate,
  MemoryKind,
  MemoryProvenance,
  MemoryRecord,
  MemoryStatus,
  ProvenanceSource,
  WorkspaceActivityEvent,
} from "./types";
