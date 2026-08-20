import {
  DeepWikiKnowledgeEngine,
  type RepositorySnapshot,
} from "./knowledge-engine";
import { useKnowledgeStore } from "#/stores/knowledge-store";
import { displayErrorToast } from "#/utils/custom-toast-handlers";

export type GenerateKnowledgeStore = Pick<
  ReturnType<typeof useKnowledgeStore.getState>,
  "startGenerating" | "setProgress" | "setReady" | "setError"
>;

/** Shared tail of every "run generation for a resolved repo snapshot" flow —
 * used by first-time generation (kt-list.tsx) and by manual re-generation
 * (kt-repository.tsx's refresh-cadence control). */
export async function generateKnowledge(
  snapshot: RepositorySnapshot,
  conversationUrl: string | null,
  sessionApiKey: string | null,
  store: GenerateKnowledgeStore,
  navigate: (path: string) => void,
) {
  store.startGenerating(snapshot, conversationUrl, sessionApiKey);
  try {
    const engine = new DeepWikiKnowledgeEngine({
      // Left unset, DeepWiki silently resolves to its default model
      // (gemini-2.5-flash) — pro gives noticeably better grounding on the
      // per-page generation this pipeline depends on.
      model: "gemini-2.5-pro",
      onProgress: (status) => store.setProgress(snapshot.repositoryId, status),
    });
    const knowledge = await engine.generate(snapshot);
    store.setReady(snapshot.repositoryId, knowledge);
    navigate(`/kt/${encodeURIComponent(snapshot.repositoryId)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    store.setError(snapshot.repositoryId, message);
    displayErrorToast(message);
  }
}
