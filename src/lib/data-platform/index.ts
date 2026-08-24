export { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";
export { DataPlatformUnavailableError } from "#/lib/data-platform/errors";
export { workspaceRepository } from "#/lib/data-platform/repositories/workspace-repository";
export type {
  WorkspaceRepository,
  WorkspaceRow,
  WorkspaceRole,
} from "#/lib/data-platform/repositories/workspace-repository";
export { memoryRepository } from "#/lib/data-platform/repositories/memory-repository";
export type { MemoryRepository } from "#/lib/data-platform/repositories/memory-repository";
export { activityStore } from "#/lib/data-platform/repositories/activity-store";
export type {
  ActivityStore,
  ActivityEvent,
} from "#/lib/data-platform/repositories/activity-store";
export { agentOpsRepository } from "#/lib/data-platform/repositories/agentops-repository";
export type {
  AgentOpsRepository,
  HistoricalAgentOpsRun,
} from "#/lib/data-platform/repositories/agentops-repository";
export { knowledgePersistenceRepository } from "#/lib/data-platform/repositories/knowledge-repository";
export type { KnowledgePersistenceRepository } from "#/lib/data-platform/repositories/knowledge-repository";
export { codegraphPersistenceRepository } from "#/lib/data-platform/repositories/codegraph-repository";
export type { CodegraphPersistenceRepository } from "#/lib/data-platform/repositories/codegraph-repository";
export {
  resolveOrgId,
  findRepositoryUuid,
  resolvePersistenceIds,
  ensureWorkspaceAccess,
} from "#/lib/data-platform/repositories/repository-identity";
export type {
  PersistenceIds,
  PersistenceIdentityInput,
  WorkspaceAccessInput,
} from "#/lib/data-platform/repositories/repository-identity";
export { automationMetadataRepository } from "#/lib/data-platform/repositories/automation-metadata-repository";
export type { AutomationMetadataRepository } from "#/lib/data-platform/repositories/automation-metadata-repository";
export { usageRepository } from "#/lib/data-platform/repositories/usage-repository";
export type {
  UsageRepository,
  UsageEventInput,
  UsageEventRow,
  UsageSource,
} from "#/lib/data-platform/repositories/usage-repository";
export { artifactStore } from "#/lib/data-platform/artifact-store";
export type {
  ArtifactStore,
  ArtifactBucket,
} from "#/lib/data-platform/artifact-store";
export { vectorStore } from "#/lib/data-platform/vector-store";
export type {
  VectorStore,
  MemorySimilarityMatch,
} from "#/lib/data-platform/vector-store";
export { jobQueue } from "#/lib/data-platform/job-queue";
export type { JobQueue } from "#/lib/data-platform/job-queue";
