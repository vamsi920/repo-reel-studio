import {
  DeepWikiKnowledgeEngine,
  type RepositorySnapshot,
  KnowledgeRepository,
} from "./knowledge-engine";
import { useKnowledgeStore } from "#/stores/knowledge-store";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import {
  ensureCodeEvidence,
  upgradeCodeEvidenceInBackground,
} from "./pre-analysis";
import { reviewKnowledgeQuality } from "./quality-review";
import { repairInvalidDiagrams } from "./mermaid-repair";
import { resolvePersistenceIds } from "#/lib/data-platform/repositories/repository-identity";
import { knowledgePersistenceRepository } from "#/lib/data-platform/repositories/knowledge-repository";

/** Fire-and-forget, mirrors src/api/workspace-memory/workspace-memory-supabase-sync.ts's
 * queueSupabaseMemorySync pattern — never blocks or fails generation. */
function queueKnowledgePersistence(
  snapshot: RepositorySnapshot,
  backendId: string | null,
  knowledge: KnowledgeRepository,
) {
  if (!backendId) return;
  void resolvePersistenceIds({
    owner: snapshot.owner,
    repo: snapshot.repo,
    branch: snapshot.branch,
    localPath: snapshot.localPath,
    backendId,
  }).then((ids) => {
    if (!ids) return;
    void knowledgePersistenceRepository.saveFullKnowledge(
      ids.repositoryUuid,
      ids.workspaceId,
      snapshot.branch,
      knowledge,
    );
  });
}

export type GenerateKnowledgeStore = Pick<
  ReturnType<typeof useKnowledgeStore.getState>,
  "startGenerating" | "setProgress" | "setReady" | "setError"
>;

export interface GenerateKnowledgeOptions {
  /** Bypass any cached DeepWiki result for this exact commit and regenerate
   * from scratch. Without this, re-running against an already-generated
   * commit is a no-op — DeepWiki's own cache short-circuit returns
   * instantly. */
  force?: boolean;
}

/** Shared tail of every "run generation for a resolved repo snapshot" flow —
 * used by first-time generation (kt-list.tsx) and by manual re-generation
 * (kt-repository.tsx's refresh-cadence control). */
export async function generateKnowledge(
  snapshot: RepositorySnapshot,
  conversationUrl: string | null,
  sessionApiKey: string | null,
  store: GenerateKnowledgeStore,
  navigate: (path: string) => void,
  options: GenerateKnowledgeOptions = {},
  backendId: string | null = null,
) {
  store.startGenerating(snapshot, conversationUrl, sessionApiKey);
  try {
    // Best-effort: real code-structure evidence from the same analyzer
    // CodeGraph uses, so structure determination isn't guessing from file
    // paths alone. Never blocks generation — a failed/timed-out analyzer
    // pass just means no evidence block gets added to the prompt.
    const evidence = await ensureCodeEvidence(
      snapshot,
      conversationUrl,
      sessionApiKey,
    );
    const engine = new DeepWikiKnowledgeEngine({
      // Left unset, DeepWiki silently resolves to its default model
      // (gemini-2.5-flash) — pro gives noticeably better grounding on the
      // per-page generation this pipeline depends on.
      model: "gemini-2.5-pro",
      onProgress: (status) => store.setProgress(snapshot.repositoryId, status),
    });
    const rawKnowledge = await engine.generate(snapshot, {
      force: options.force,
      codeEvidence: evidence?.summary.rendered,
      codeEvidenceSubsystems: evidence?.subsystems,
    });
    // Best-effort: validate every real generated Mermaid diagram and
    // single-shot-repair any that fail to parse. Never blocks or fails
    // generation — a repair-pass network error just leaves diagrams as
    // DeepWiki generated them.
    const knowledge = await repairInvalidDiagrams(rawKnowledge, snapshot).catch(
      () => rawKnowledge,
    );
    const qualityFlags = reviewKnowledgeQuality(knowledge, evidence?.handle);
    store.setReady(snapshot.repositoryId, knowledge, qualityFlags);
    navigate(`/kt/${encodeURIComponent(snapshot.repositoryId)}`);
    queueKnowledgePersistence(snapshot, backendId, knowledge);
    if (evidence) {
      // Re-run analysis with real subsystem hints now that Knowledge exists,
      // so a later CodeGraph visit finds better-named subsystems without the
      // user manually re-analyzing. Fire-and-forget by design.
      upgradeCodeEvidenceInBackground(
        snapshot,
        conversationUrl,
        sessionApiKey,
        knowledge,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    store.setError(snapshot.repositoryId, message);
    displayErrorToast(message);
  }
}
