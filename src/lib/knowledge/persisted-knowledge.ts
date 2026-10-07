import {
  findRepositoryUuid,
  resolveOrgIdWithStatus,
} from "#/lib/data-platform/repositories/repository-identity";
import { knowledgePersistenceRepository } from "#/lib/data-platform/repositories/knowledge-repository";
import type { KnowledgeRepository } from "./knowledge-engine";

/** `loadPersistedKnowledge`'s outcome. `"org-error"` means the org lookup
 * itself failed (an auth/PostgREST timing glitch), as opposed to there
 * genuinely being no persisted generation for this repo. */
export type PersistedKnowledgeResult =
  | { status: "found"; knowledge: KnowledgeRepository }
  | { status: "not-found" }
  | { status: "org-error" };

/**
 * The latest KT generation persisted to Supabase for `owner/repo@branch`,
 * readable with no live session. Shared by cold rehydration of the KT pages
 * and by the conversation-time workspace sync that writes KT docs into a
 * chat's folder.
 */
export async function loadPersistedKnowledge(
  owner: string,
  repo: string,
  branch: string,
): Promise<PersistedKnowledgeResult> {
  const { orgId, hadError } = await resolveOrgIdWithStatus();
  if (!orgId) return { status: hadError ? "org-error" : "not-found" };
  const repositoryUuid = await findRepositoryUuid(orgId, owner, repo);
  if (!repositoryUuid) return { status: "not-found" };
  const knowledge =
    await knowledgePersistenceRepository.getLatestGenerationForRepository(
      repositoryUuid,
      branch,
    );
  return knowledge ? { status: "found", knowledge } : { status: "not-found" };
}
