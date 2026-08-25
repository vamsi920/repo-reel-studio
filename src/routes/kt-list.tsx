import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, Loader2, Plus, RefreshCw } from "lucide-react";
import { usePaginatedConversations } from "#/hooks/query/use-paginated-conversations";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useActiveBackend } from "#/contexts/active-backend-context";
import AgentServerGitService from "#/api/git-service/agent-server-git-service.api";
import { getGitPath } from "#/utils/get-git-path";
import { useKnowledgeStore } from "#/stores/knowledge-store";
import type { RepositorySnapshot } from "#/lib/knowledge/knowledge-engine";
import { waitForWorkspaceReady } from "#/lib/knowledge/conversation-provisioning";
import { generateKnowledge } from "#/lib/knowledge/generate-knowledge";
import {
  knowledgePersistenceRepository,
  type PersistedRepositorySummary,
} from "#/lib/data-platform/repositories/knowledge-repository";
import { useNavigation } from "#/context/navigation-context";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { I18nKey } from "#/i18n/declaration";
import { OpenWorkspaceDialog } from "#/components/features/home/open-workspace-dialog";
import { OpenRepositoryDialog } from "#/components/features/home/open-repository-dialog";
import { isLocalGithubConnected } from "#/api/git-service/github-connection-flag";
import { ProvisioningCard } from "#/components/features/kt-video/provisioning-card";
import type { LocalWorkspace } from "#/types/workspace";
import type { Branch, GitRepository } from "#/types/git";
import type { Provider } from "#/types/settings";

interface RepoCandidate {
  repositoryId: string;
  owner: string;
  repo: string;
  branch: string;
  conversationUrl: string | null;
  sessionApiKey: string | null;
  workingDir: string | null;
  /** True for a repo sourced from Supabase with no live store entry and no
   * open conversation — RepoCard treats this the same as "ready" (real
   * knowledge exists, just not loaded into memory yet; opening it triggers
   * kt-repository.tsx's cold rehydration). */
  knownGenerated?: boolean;
}

/** One card per distinct repository already connected to Neo, sourced
 * from real conversation history. Repositories added via the "Add
 * Repository" trigger show up here automatically once their conversation is
 * created (usePaginatedConversations picks it up on refetch), but they're
 * also tracked live in the knowledge store from the moment they're added —
 * see the provisioning cards rendered above this list. */
function useConnectedRepositories(): RepoCandidate[] {
  const { data } = usePaginatedConversations(100);
  return useMemo(() => {
    const conversations = data?.pages.flatMap((page) => page.items) ?? [];
    const byRepo = new Map<string, RepoCandidate>();
    for (const conversation of conversations) {
      const repoSlug = conversation.selected_repository;
      if (!repoSlug) continue;
      const [owner, repo] = repoSlug.split("/");
      if (!owner || !repo) continue;
      const branch = conversation.selected_branch ?? "main";
      const repositoryId = `${repoSlug}@${branch}`;
      if (byRepo.has(repositoryId)) continue;
      byRepo.set(repositoryId, {
        repositoryId,
        owner,
        repo,
        branch,
        conversationUrl: conversation.conversation_url,
        sessionApiKey: conversation.session_api_key,
        workingDir: conversation.workspace?.working_dir?.trim() || null,
      });
    }
    return Array.from(byRepo.values());
  }, [data]);
}

/** Local-workspace repos (added via "Add Repository" → a folder) have no
 * `selected_repository` on their conversation, so useConnectedRepositories()
 * never finds them — without this, a locally-added repo would vanish from
 * /kt the moment its provisioning/generating card clears (on success OR
 * error), even though its knowledge-store entry is still there. */
/** Repos with real, previously-generated Knowledge in Supabase but no open
 * conversation right now — without this, they'd vanish from /kt entirely on
 * reload, exactly the empty-page problem this is fixing at the list level. */
function usePersistedRepositories(): PersistedRepositorySummary[] {
  const [summaries, setSummaries] = useState<PersistedRepositorySummary[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list =
        await knowledgePersistenceRepository.listGeneratedRepositories();
      if (!cancelled) setSummaries(list);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return summaries;
}

function useAllRepositories(connected: RepoCandidate[]): RepoCandidate[] {
  const byRepositoryId = useKnowledgeStore((s) => s.byRepositoryId);
  const persisted = usePersistedRepositories();
  return useMemo(() => {
    const connectedIds = new Set(connected.map((c) => c.repositoryId));
    const extra: RepoCandidate[] = [];
    for (const [id, state] of Object.entries(byRepositoryId)) {
      if (connectedIds.has(id) || state.snapshot.owner !== "local") continue;
      extra.push({
        repositoryId: id,
        owner: state.snapshot.owner,
        repo: state.snapshot.repo,
        branch: state.snapshot.branch,
        conversationUrl: state.conversationUrl,
        sessionApiKey: state.sessionApiKey,
        workingDir: state.snapshot.localPath,
      });
    }
    const known = new Set([
      ...connectedIds,
      ...extra.map((c) => c.repositoryId),
    ]);
    for (const summary of persisted) {
      const branch = summary.branch ?? "main";
      const repositoryId = `${summary.owner}/${summary.repo}@${branch}`;
      if (known.has(repositoryId)) continue;
      known.add(repositoryId);
      extra.push({
        repositoryId,
        owner: summary.owner,
        repo: summary.repo,
        branch,
        conversationUrl: null,
        sessionApiKey: null,
        workingDir: null,
        knownGenerated: true,
      });
    }
    return [...connected, ...extra];
  }, [connected, byRepositoryId, persisted]);
}

async function resolveCommitSha(
  owner: string,
  repo: string,
  workingDir: string,
  conversationUrl: string | null,
  sessionApiKey: string | null,
): Promise<string> {
  const gitPath = getGitPath(`${owner}/${repo}`, workingDir);
  const commitsPage = await AgentServerGitService.getGitCommits(
    conversationUrl,
    sessionApiKey,
    gitPath,
  );
  const commitSha = commitsPage?.commits[0]?.sha;
  if (!commitSha) {
    throw new Error(
      "Couldn't resolve a commit for this repository — it may not have any commits yet.",
    );
  }
  return commitSha;
}

async function resolveSnapshot(
  candidate: RepoCandidate,
): Promise<RepositorySnapshot> {
  if (!candidate.workingDir) {
    throw new Error(
      "This repository's workspace hasn't finished provisioning yet — open its conversation and try again once it's ready.",
    );
  }
  const commitSha = await resolveCommitSha(
    candidate.owner,
    candidate.repo,
    candidate.workingDir,
    candidate.conversationUrl,
    candidate.sessionApiKey,
  );
  return {
    repositoryId: candidate.repositoryId,
    owner: candidate.owner,
    repo: candidate.repo,
    branch: candidate.branch,
    commitSha,
    localPath: candidate.workingDir,
  };
}

function RepoCard({ candidate }: { candidate: RepoCandidate }) {
  const { t } = useTranslation("openhands");
  const { navigate } = useNavigation();
  const { backend } = useActiveBackend();
  const state = useKnowledgeStore(
    (s) => s.byRepositoryId[candidate.repositoryId],
  );
  const startGenerating = useKnowledgeStore((s) => s.startGenerating);
  const setProgress = useKnowledgeStore((s) => s.setProgress);
  const setReady = useKnowledgeStore((s) => s.setReady);
  const setError = useKnowledgeStore((s) => s.setError);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isGenerating = state?.status === "generating" || isSubmitting;
  const isReady =
    state?.status === "ready" || (!state && candidate.knownGenerated);

  const handleGenerate = async () => {
    setIsSubmitting(true);
    try {
      const snapshot = await resolveSnapshot(candidate);
      await generateKnowledge(
        snapshot,
        candidate.conversationUrl,
        candidate.sessionApiKey,
        { startGenerating, setProgress, setReady, setError },
        (path) => navigate?.(path),
        {},
        backend.id,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setError(candidate.repositoryId, message);
      displayErrorToast(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      data-testid="kt-repo-card"
      className="instrument-panel ame-card flex flex-col gap-3 p-4"
    >
      <div className="flex items-center gap-2">
        <BookOpen className="size-4 text-[var(--oh-muted)]" aria-hidden />
        <span className="text-sm font-medium text-[var(--oh-foreground)]">
          {candidate.owner}/{candidate.repo}
        </span>
        <span className="text-xs text-[var(--oh-muted)]">
          {candidate.branch}
        </span>
      </div>

      {isReady ? (
        <button
          type="button"
          onClick={() =>
            navigate?.(`/kt/${encodeURIComponent(candidate.repositoryId)}`)
          }
          className="ame-btn-secondary ame-btn-sm self-start"
        >
          {t(I18nKey.KT$VIEW_KNOWLEDGE)}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating}
          data-testid="kt-generate-button"
          className="ame-btn-primary ame-btn-sm self-start disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isGenerating ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {state?.progress?.status
                ? t(I18nKey.KT$STATUS, { status: state.progress.status })
                : t(I18nKey.KT$STARTING)}
            </span>
          ) : (
            t(I18nKey.KT$GENERATE)
          )}
        </button>
      )}
      {state?.status === "error" && (
        <p className="text-xs text-[var(--error-500)]">{state.error}</p>
      )}
    </div>
  );
}

/** Renders every in-flight "Add Repository" flow — visible immediately on
 * selection, before a conversation/workspace/commit even exists yet, and
 * stays visible through DeepWiki generation. This is the persistent
 * "trigger" the user watches; it's driven entirely by the knowledge store,
 * so it survives navigating away from /kt and back. */
function ProvisioningCards() {
  const provisioning = useKnowledgeStore((s) => s.provisioningByRepositoryId);
  const generating = useKnowledgeStore((s) => s.byRepositoryId);

  const provisioningIds = Object.keys(provisioning);
  const generatingIds = Object.keys(generating).filter(
    (id) =>
      (generating[id].status === "generating" ||
        generating[id].status === "error") &&
      !(id in provisioning),
  );

  if (provisioningIds.length === 0 && generatingIds.length === 0) return null;

  return (
    <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {provisioningIds.map((id) => {
        const p = provisioning[id];
        return (
          <ProvisioningCard
            key={id}
            owner={p.owner}
            repo={p.repo}
            branch={p.branch}
            provisioningStage={p.stage}
            deepWikiStatus={null}
            error={p.error}
          />
        );
      })}
      {generatingIds.map((id) => {
        const g = generating[id];
        return (
          <ProvisioningCard
            key={id}
            owner={g.snapshot.owner}
            repo={g.snapshot.repo}
            branch={g.snapshot.branch}
            provisioningStage={null}
            deepWikiStatus={g.progress?.status ?? "pending"}
            pagesDone={g.progress?.pages_done}
            pagesTotal={g.progress?.pages_total}
            error={g.error}
          />
        );
      })}
    </div>
  );
}

function AddRepositoryTrigger() {
  const { t } = useTranslation("openhands");
  const { navigate } = useNavigation();
  const { backend } = useActiveBackend();
  const isLocal = backend.kind === "local";
  const canPickGithubRepo = isLocal && isLocalGithubConnected();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogModeOverride, setDialogModeOverride] = useState<
    "workspace" | "repository" | null
  >(null);
  const dialogMode =
    dialogModeOverride ?? (canPickGithubRepo ? "repository" : "workspace");
  const { mutateAsync: createConversation } = useCreateConversation();

  const startProvisioning = useKnowledgeStore((s) => s.startProvisioning);
  const setProvisioningStage = useKnowledgeStore((s) => s.setProvisioningStage);
  const setProvisioningError = useKnowledgeStore((s) => s.setProvisioningError);
  const clearProvisioning = useKnowledgeStore((s) => s.clearProvisioning);
  const startGenerating = useKnowledgeStore((s) => s.startGenerating);
  const setProgress = useKnowledgeStore((s) => s.setProgress);
  const setReady = useKnowledgeStore((s) => s.setReady);
  const setError = useKnowledgeStore((s) => s.setError);

  const runFlow = async (
    repositoryId: string,
    owner: string,
    repo: string,
    branch: string,
    createVariables: Parameters<typeof createConversation>[0],
  ) => {
    startProvisioning(repositoryId, { owner, repo, branch });
    try {
      const created = await createConversation(createVariables);
      setProvisioningStage(repositoryId, "provisioning_workspace");
      const conversation = await waitForWorkspaceReady(
        created.conversation_id,
        created.task_id,
      );
      setProvisioningStage(repositoryId, "resolving_commit");
      const workingDir = conversation.workspace!.working_dir!.trim();
      const commitSha = await resolveCommitSha(
        owner,
        repo,
        workingDir,
        conversation.conversation_url,
        conversation.session_api_key,
      );
      clearProvisioning(repositoryId);
      await generateKnowledge(
        {
          repositoryId,
          owner,
          repo,
          branch,
          commitSha,
          localPath: workingDir,
        },
        conversation.conversation_url,
        conversation.session_api_key,
        { startGenerating, setProgress, setReady, setError },
        (path) => navigate?.(path),
        {},
        backend.id,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setProvisioningError(repositoryId, message);
      displayErrorToast(message);
    }
  };

  const handleWorkspaceConfirm = (workspace: LocalWorkspace) => {
    setIsDialogOpen(false);
    const owner = "local";
    const repo = workspace.name;
    const branch = "main";
    const repositoryId = `${owner}/${repo}@${branch}`;
    void runFlow(repositoryId, owner, repo, branch, {
      workingDir: workspace.path,
      workspaceMode: "local_repo",
      entryPoint: "kt_add_repository",
    });
  };

  const handleRepositoryConfirm = (selection: {
    repository: GitRepository;
    branch: Branch;
    provider: Provider | null;
  }) => {
    setIsDialogOpen(false);
    const [owner, repo] = selection.repository.full_name.split("/");
    const branch = selection.branch.name;
    const repositoryId = `${selection.repository.full_name}@${branch}`;
    void runFlow(
      repositoryId,
      owner ?? "unknown",
      repo ?? selection.repository.full_name,
      branch,
      {
        repository: {
          name: selection.repository.full_name,
          gitProvider: selection.provider ?? selection.repository.git_provider,
          branch,
        },
        entryPoint: "kt_add_repository",
      },
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDialogModeOverride(null);
          setIsDialogOpen(true);
        }}
        data-testid="kt-add-repository-button"
        className="ame-btn-primary ame-btn-sm flex items-center gap-1.5"
      >
        <Plus className="size-3.5" aria-hidden />
        {t(I18nKey.KT$ADD_REPOSITORY)}
      </button>

      {dialogMode === "workspace" ? (
        <OpenWorkspaceDialog
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          onConfirm={handleWorkspaceConfirm}
          footer={
            canPickGithubRepo ? (
              <button
                type="button"
                data-testid="switch-to-repository-picker"
                onClick={() => setDialogModeOverride("repository")}
                className="w-full text-center text-xs text-[var(--oh-muted)] hover:text-white hover:underline underline-offset-2"
              >
                {t(I18nKey.CONNECTIONS$SWITCH_TO_REPOSITORY)}
              </button>
            ) : undefined
          }
        />
      ) : (
        <OpenRepositoryDialog
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          onConfirm={handleRepositoryConfirm}
          footer={
            isLocal ? (
              <button
                type="button"
                data-testid="switch-to-workspace-picker"
                onClick={() => setDialogModeOverride("workspace")}
                className="w-full text-center text-xs text-[var(--oh-muted)] hover:text-white hover:underline underline-offset-2"
              >
                {t(I18nKey.CONNECTIONS$SWITCH_TO_WORKSPACE)}
              </button>
            ) : undefined
          }
        />
      )}
    </>
  );
}

function KtList() {
  const { t } = useTranslation("openhands");
  const repositories = useAllRepositories(useConnectedRepositories());
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return repositories;
    return repositories.filter((candidate) =>
      `${candidate.owner}/${candidate.repo}`.toLowerCase().includes(query),
    );
  }, [repositories, search]);

  return (
    <main className="min-h-full" data-testid="kt-list">
      <div className="mx-auto max-w-4xl p-6">
        <div className="mb-6 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookOpen
              className="size-5 text-[var(--oh-foreground)]"
              aria-hidden
            />
            <h1 className="text-xl font-semibold text-[var(--oh-foreground)]">
              {t(I18nKey.KT$TITLE)}
            </h1>
          </div>
          <AddRepositoryTrigger />
        </div>
        <p className="mb-6 text-sm text-[var(--oh-muted)]">
          {t(I18nKey.KT$SUBTITLE)}
        </p>

        <ProvisioningCards />

        {repositories.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--oh-border)] p-8 text-center text-sm text-[var(--oh-muted)]">
            <RefreshCw className="mx-auto mb-2 size-5" aria-hidden />
            {t(I18nKey.KT$EMPTY)}
          </div>
        ) : (
          <>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t(I18nKey.KT$SEARCH_PLACEHOLDER)}
              data-testid="kt-search-input"
              className="mb-4 w-full rounded-md border border-[var(--oh-border)] bg-transparent px-3 py-2 text-sm text-[var(--oh-foreground)] placeholder:text-[var(--oh-muted)]"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filtered.map((candidate) => (
                <RepoCard key={candidate.repositoryId} candidate={candidate} />
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default KtList;
