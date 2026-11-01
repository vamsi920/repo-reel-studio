/**
 * Neo Test's bridge to the Knowledge (KT) module: find the KT docs Neo has
 * already generated for a project (in this browser's store, or persisted in
 * Supabase), write them into the test workspace so the agent plans from the
 * architecture map instead of starting from scratch, and start a
 * generation from the studio when none exist yet.
 *
 * @spec NT-008 — KT and Synth power-ups
 */
import type {
  KnowledgeRepository,
  RepositorySnapshot,
} from "#/lib/knowledge/knowledge-engine";
import { findKnowledgeForConversation } from "#/lib/knowledge/kt-agent-context";
import {
  exportKtToWorkspace,
  readWorkspaceKtCommit,
} from "#/lib/knowledge/kt-workspace-export";
import { KT_INDEX_FILE, ktPagePath } from "#/lib/knowledge/kt-format";
import { loadPersistedKnowledge } from "#/lib/knowledge/persisted-knowledge";
import { generateKnowledge } from "#/lib/knowledge/generate-knowledge";
import { useKnowledgeStore } from "#/stores/knowledge-store";
import type { RunInWorkspace } from "#/lib/modernization/replay-harness";
import type { ProjectSource, TestKtState } from "#/stores/test-studio-store";

export interface TestRuntime {
  conversationUrl: string | null;
  sessionApiKey: string | null;
  workingDir: string | null;
  backendId?: string | null;
}

/** `owner`/`repo`/`branch` for a repository source; null for a folder. */
export function repoParts(
  source: ProjectSource,
): { owner: string; repo: string; branch: string } | null {
  if (source.kind !== "repository") return null;
  const [owner, repo] = source.name.split("/");
  if (!owner || !repo) return null;
  return { owner, repo, branch: source.branch ?? "main" };
}

/** Repository id the knowledge store keys by. */
export function knowledgeRepositoryId(source: ProjectSource): string {
  const parts = repoParts(source);
  return parts
    ? `${parts.owner}/${parts.repo}@${parts.branch}`
    : `local:${source.name}`;
}

/**
 * The KT docs Neo already has for this source: the store first (generated or
 * hydrated in this browser, matched by folder or repository), then Supabase
 * for repository sources. Seeds the store when Supabase had them so the
 * rest of the app sees the same knowledge.
 */
export async function resolveTestKnowledge(source: ProjectSource): Promise<{
  knowledge: KnowledgeRepository;
  from: "store" | "supabase";
} | null> {
  const parts = repoParts(source);
  const inStore = findKnowledgeForConversation({
    workingDir: source.kind === "folder" ? source.name : null,
    repository: parts ? `${parts.owner}/${parts.repo}` : null,
    branch: parts?.branch ?? null,
  });
  if (inStore) return { knowledge: inStore, from: "store" };
  if (!parts) return null;
  try {
    const result = await loadPersistedKnowledge(
      parts.owner,
      parts.repo,
      parts.branch,
    );
    if (result.status !== "found") return null;
    const repositoryId = knowledgeRepositoryId(source);
    if (!useKnowledgeStore.getState().byRepositoryId[repositoryId]) {
      useKnowledgeStore.getState().hydrate(
        repositoryId,
        {
          repositoryId,
          owner: parts.owner,
          repo: parts.repo,
          branch: parts.branch,
          commitSha: result.knowledge.commitSha,
          localPath: "",
        },
        result.knowledge,
        [],
      );
    }
    return { knowledge: result.knowledge, from: "supabase" };
  } catch {
    return null;
  }
}

/** Compact view of the docs for the store, the card and `describe`. */
export function summarizeKnowledge(
  knowledge: KnowledgeRepository,
  from: TestKtState["from"],
): TestKtState {
  const rank = { high: 0, medium: 1, low: 2 } as const;
  return {
    status: "available",
    from,
    commitSha: knowledge.commitSha,
    generatedAt: knowledge.generatedAt,
    title: knowledge.title,
    pages: [...knowledge.pages]
      .sort((a, b) => rank[a.importance] - rank[b.importance])
      .slice(0, 60)
      .map((p) => ({
        id: p.id,
        title: p.title,
        path: ktPagePath(p.id),
        importance: p.importance,
      })),
    indexPath: KT_INDEX_FILE,
    exportedCommit: null,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Makes sure the workspace holds the docs for `knowledge.commitSha`;
 * returns the commit now on disk (or null when nothing could be written).
 */
export async function ensureKtInWorkspace(
  runtime: TestRuntime,
  knowledge: KnowledgeRepository,
  source: ProjectSource,
): Promise<string | null> {
  if (!runtime.conversationUrl || !runtime.workingDir) return null;
  const context = {
    conversationUrl: runtime.conversationUrl,
    sessionApiKey: runtime.sessionApiKey,
    workingDir: runtime.workingDir,
  };
  const existing = await readWorkspaceKtCommit(context);
  if (existing === knowledge.commitSha) return existing;
  const parts = repoParts(source);
  const snapshot: RepositorySnapshot = {
    repositoryId: knowledgeRepositoryId(source),
    owner: parts?.owner ?? "local",
    repo: parts?.repo ?? source.name.split("/").pop() ?? "project",
    branch: parts?.branch ?? "",
    commitSha: knowledge.commitSha,
    localPath: runtime.workingDir,
  };
  const result = await exportKtToWorkspace(context, knowledge, snapshot);
  return result.ok ? knowledge.commitSha : null;
}

/** The checkout's HEAD, through the runtime; null when not a git checkout. */
export async function readHeadCommit(
  run: RunInWorkspace,
): Promise<string | null> {
  try {
    const result = await run("git rev-parse HEAD 2>/dev/null || true");
    const sha = result.stdout?.trim();
    return sha && /^[0-9a-f]{7,64}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

export type KtGenerationOutcome =
  | { ok: true; knowledge: KnowledgeRepository }
  | {
      ok: false;
      reason: "no_runtime" | "no_commit" | "failed";
      detail?: string;
    };

/**
 * Generates KT docs for the project from the studio, using the test
 * conversation's own checkout. Progress lands in the knowledge store under
 * `knowledgeRepositoryId(source)` (the KT card reads it); resolves once the
 * docs are ready or generation failed. Never navigates away.
 */
export async function generateKtForProject(
  source: ProjectSource,
  runtime: TestRuntime,
  run: RunInWorkspace,
): Promise<KtGenerationOutcome> {
  if (!runtime.conversationUrl || !runtime.workingDir) {
    return { ok: false, reason: "no_runtime" };
  }
  const commitSha = await readHeadCommit(run);
  if (!commitSha) return { ok: false, reason: "no_commit" };
  const parts = repoParts(source);
  const repositoryId = knowledgeRepositoryId(source);
  const snapshot: RepositorySnapshot = {
    repositoryId,
    owner: parts?.owner ?? "local",
    repo: parts?.repo ?? source.name.split("/").pop() ?? "project",
    branch: parts?.branch ?? "",
    commitSha,
    localPath: runtime.workingDir,
  };
  const store = useKnowledgeStore.getState();
  try {
    await generateKnowledge(
      snapshot,
      runtime.conversationUrl,
      runtime.sessionApiKey,
      {
        startGenerating: store.startGenerating,
        setProgress: store.setProgress,
        setReady: store.setReady,
        setError: store.setError,
      },
      () => {},
      {},
      runtime.backendId ?? null,
    );
  } catch (error) {
    return {
      ok: false,
      reason: "failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  const entry = useKnowledgeStore.getState().byRepositoryId[repositoryId];
  if (entry?.knowledge) return { ok: true, knowledge: entry.knowledge };
  return {
    ok: false,
    reason: "failed",
    detail: entry?.error ?? "no knowledge produced",
  };
}
