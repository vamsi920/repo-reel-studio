import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { FolderOpen, GitBranch, Plus, Replace, Trash2 } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import {
  NavigationProvider,
  useNavigation,
  type NavigationContextValue,
} from "#/context/navigation-context";
import { WebSocketProviderWrapper } from "#/contexts/websocket-provider-wrapper";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { EventHandler } from "#/wrapper/event-handler";
import { ChatInterface } from "#/components/features/chat/chat-interface";
import { ChatSurfaceProvider } from "#/context/chat-surface-context";
import { ResizeHandle } from "#/components/ui/resize-handle";
import { useResizablePanels } from "#/hooks/use-resizable-panels";
import { useBreakpoint } from "#/hooks/use-breakpoint";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useUserConversation } from "#/hooks/query/use-user-conversation";
import { useTrackRealUsage } from "#/hooks/use-track-real-usage";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { pauseConversation } from "#/hooks/mutation/conversation-mutation-utils";
import { OpenRepositoryDialog } from "#/components/features/home/open-repository-dialog";
import { FolderBrowserModal } from "#/components/features/home/workspace-dropdown/folder-browser-modal";
import { isModernizationReceiptEvent } from "#/utils/modernization-receipt";
import {
  START_MIGRATION_APPROVAL_ID,
  createModernizationResultPoster,
  receipt,
} from "#/services/modernization-control";
import {
  useModernizationStudioStore,
  type ModernizationProject,
  type ProjectSource,
} from "#/stores/modernization-studio-store";
import {
  ModernizationWorkbench,
  statusLabelKey,
} from "#/components/features/modernization/studio/modernization-workbench";
import { NEOME_SYSTEM_BRIEF } from "#/components/features/modernization/brief";
import { ensureReaMcpServer } from "#/lib/modernization/rea-mcp";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import type { Branch, GitRepository } from "#/types/git";
import type { Provider } from "#/types/settings";
import type { LocalWorkspace } from "#/types/workspace";

/** Tab ids for the mobile layout; not user-facing text. */
const MOBILE_TABS = ["chat", "workbench"] as const;

/** The shared chat without the coding chrome; receipts stay hidden. */
function StudioChat() {
  const { t } = useTranslation("openhands");
  const surface = React.useMemo(
    () => ({
      showGitControls: false,
      placeholder: t(I18nKey.NEOME$COMPOSER_PLACEHOLDER),
      hideEvent: isModernizationReceiptEvent,
    }),
    [t],
  );
  return (
    <ChatSurfaceProvider value={surface}>
      <ChatInterface />
    </ChatSurfaceProvider>
  );
}

function StudioPanes({ project }: { project: ModernizationProject }) {
  const { t } = useTranslation("openhands");
  const isMobile = useBreakpoint();
  const [mobileTab, setMobileTab] = React.useState<"chat" | "workbench">(
    "chat",
  );
  const [busy, setBusy] = React.useState(false);
  const setStatus = useModernizationStudioStore((s) => s.setStatus);
  const requestApproval = useModernizationStudioStore((s) => s.requestApproval);
  const conversationId = project.conversationId!;
  // Every turn's spend lands in usage_events like a normal conversation.
  useTrackRealUsage();

  const { leftWidth, rightWidth, isDragging, containerRef, handleMouseDown } =
    useResizablePanels({
      defaultLeftWidth: 45,
      minLeftWidth: 30,
      maxLeftWidth: 65,
      storageKey: "neome-panel-width",
    });

  const postResult = React.useMemo(
    () => createModernizationResultPoster(conversationId),
    [conversationId],
  );
  const sendUserMessage = React.useCallback(
    (text: string) =>
      AgentServerConversationService.sendMessage(conversationId, {
        role: "user",
        content: [{ type: "text", text }],
      }),
    [conversationId],
  );

  const onStart = React.useCallback(async () => {
    setBusy(true);
    try {
      // The button is the user's approval to start building; the dispatcher
      // refuses scaffold/migrate/data steps without one.
      requestApproval(project.id, {
        id: START_MIGRATION_APPROVAL_ID,
        what: t(I18nKey.NEOME$START_MIGRATION),
        status: "approved",
        at: new Date().toISOString(),
      });
      await sendUserMessage(t(I18nKey.NEOME$START_MIGRATION_MESSAGE));
      setStatus(project.id, "migrating");
    } catch {
      displayErrorToast(t(I18nKey.NEOME$ACTION_ERROR));
    } finally {
      setBusy(false);
    }
  }, [sendUserMessage, setStatus, requestApproval, project.id, t]);

  const onPause = React.useCallback(async () => {
    setBusy(true);
    try {
      await pauseConversation(conversationId);
      setStatus(project.id, "paused");
      postResult(receipt({ status: "paused_by_user" }));
    } catch {
      displayErrorToast(t(I18nKey.NEOME$ACTION_ERROR));
    } finally {
      setBusy(false);
    }
  }, [conversationId, postResult, setStatus, project.id, t]);

  const onResume = React.useCallback(async () => {
    setBusy(true);
    try {
      await AgentServerConversationService.resumeConversation(conversationId);
      await sendUserMessage(t(I18nKey.NEOME$RESUME_PROMPT));
      setStatus(project.id, "migrating");
    } catch {
      displayErrorToast(t(I18nKey.NEOME$ACTION_ERROR));
    } finally {
      setBusy(false);
    }
  }, [conversationId, sendUserMessage, setStatus, project.id, t]);

  const workbench = (
    <ModernizationWorkbench
      projectId={project.id}
      postResult={postResult}
      onStart={onStart}
      onPause={onPause}
      onResume={onResume}
      busy={busy}
    />
  );

  if (isMobile) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 gap-1 border-b border-[var(--border-color)] px-2">
          {MOBILE_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              data-testid={`neome-mobile-tab-${tab}`}
              onClick={() => setMobileTab(tab)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm",
                mobileTab === tab
                  ? "border-[var(--primary-500)] text-[var(--text-primary)]"
                  : "border-transparent text-[var(--text-tertiary)]",
              )}
            >
              {tab === "chat"
                ? t(I18nKey.NEOME$MOBILE_CHAT)
                : t(I18nKey.NEOME$MOBILE_WORKBENCH)}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1">
          {mobileTab === "chat" ? <StudioChat /> : workbench}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1">
      <div
        style={{ width: `${leftWidth}%` }}
        className="flex min-h-0 min-w-0 flex-col"
      >
        <StudioChat />
      </div>
      <ResizeHandle onMouseDown={handleMouseDown} isDragging={isDragging} />
      <div style={{ width: `${rightWidth}%` }} className="min-h-0 min-w-0">
        {workbench}
      </div>
    </div>
  );
}

/**
 * Overrides `NavigationContext.conversationId` so the prop-less chat tree
 * works on a route whose param is the project id, not a conversation id.
 */
function StudioShell({
  project,
  outerNavigation,
}: {
  project: ModernizationProject;
  outerNavigation: NavigationContextValue;
}) {
  const conversationId = project.conversationId!;
  const value = React.useMemo<NavigationContextValue>(
    () => ({ ...outerNavigation, conversationId }),
    [outerNavigation, conversationId],
  );
  return (
    <NavigationProvider value={value}>
      <WebSocketProviderWrapper conversationId={conversationId}>
        <EventHandler>
          <main
            data-testid="neome-studio"
            className="flex h-full min-h-0 flex-col"
          >
            <StudioPanes project={project} />
          </main>
        </EventHandler>
      </WebSocketProviderWrapper>
    </NavigationProvider>
  );
}

/* ── Project list / intake ─────────────────────────────────────────────── */

function sourceLabel(source: ProjectSource): string {
  return source.kind === "repository"
    ? `${source.name}${source.branch ? `@${source.branch}` : ""}`
    : source.name;
}

function ProjectsScreen() {
  const { t } = useTranslation("openhands");
  const navigate = useNavigate();
  const active = useActiveBackend();
  const projects = useModernizationStudioStore((s) => s.projects);
  const createProject = useModernizationStudioStore((s) => s.createProject);
  const removeProject = useModernizationStudioStore((s) => s.removeProject);
  const setConversationId = useModernizationStudioStore(
    (s) => s.setConversationId,
  );
  const { mutateAsync: createConversation, isPending: creating } =
    useCreateConversation();
  const [repoDialogOpen, setRepoDialogOpen] = React.useState(false);
  const [folderOpen, setFolderOpen] = React.useState(false);
  const [starting, setStarting] = React.useState(false);

  const list = React.useMemo(
    () =>
      Object.values(projects).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    [projects],
  );

  const startProject = async (
    name: string,
    source: ProjectSource,
    variables: Parameters<typeof createConversation>[0],
  ) => {
    setStarting(true);
    const project = createProject({ name, source });
    try {
      // REA first, so the conversation's MCP tool list already includes it.
      const rea = await ensureReaMcpServer();
      if (rea === "failed") displayErrorToast(t(I18nKey.NEOME$REA_FAILED));
      else if (rea === "added") displaySuccessToast(t(I18nKey.NEOME$REA_READY));

      const created = await createConversation({
        ...variables,
        query: t(I18nKey.NEOME$START_PROMPT),
        extraSystemSuffix: NEOME_SYSTEM_BRIEF,
        entryPoint: "neome_studio",
      });
      setConversationId(project.id, created.conversation_id);
      void AgentServerConversationService.updateConversationTitle(
        created.conversation_id,
        t(I18nKey.NEOME$STUDIO_CONVERSATION_TITLE, { name }),
      ).catch(() => {});
      navigate(`/modernize/${project.id}`);
    } catch (error) {
      removeProject(project.id);
      displayErrorToast(
        error instanceof Error && error.message
          ? error.message
          : t(I18nKey.NEOME$START_ERROR),
      );
    } finally {
      setStarting(false);
    }
  };

  const onRepository = (selection: {
    repository: GitRepository;
    branch: Branch;
    provider: Provider | null;
  }) => {
    setRepoDialogOpen(false);
    const name =
      selection.repository.full_name.split("/").pop() ??
      selection.repository.full_name;
    void startProject(
      name,
      {
        kind: "repository",
        name: selection.repository.full_name,
        branch: selection.branch.name,
        gitProvider: selection.provider ?? selection.repository.git_provider,
      },
      {
        repository: {
          name: selection.repository.full_name,
          gitProvider: selection.provider ?? selection.repository.git_provider,
          branch: selection.branch.name,
        },
      },
    );
  };

  const onFolder = (items: LocalWorkspace[]) => {
    setFolderOpen(false);
    const folder = items[0];
    if (!folder) return;
    void startProject(
      folder.name,
      { kind: "folder", name: folder.path },
      { workingDir: folder.path },
    );
  };

  const busy = creating || starting;

  if (active.backend.kind === "cloud") {
    return (
      <main
        data-testid="neome-cloud-unsupported"
        className="flex flex-col items-center justify-center gap-4 p-10 text-center"
      >
        <Replace size={24} aria-hidden className="text-[var(--primary-500)]" />
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">
          {t(I18nKey.NEOME$TITLE)}
        </h1>
        <p className="max-w-[52ch] text-sm text-[var(--text-secondary)]">
          {t(I18nKey.NEOME$CLOUD_UNSUPPORTED)}
        </p>
      </main>
    );
  }

  return (
    <main
      data-testid="neome-projects"
      className="flex h-full min-h-0 flex-col overflow-y-auto"
    >
      <header className="flex flex-col gap-2 px-8 pt-8 pb-4">
        <div className="flex items-center gap-2">
          <Replace
            size={22}
            aria-hidden
            className="text-[var(--primary-500)]"
          />
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
            {t(I18nKey.NEOME$TITLE)}
          </h1>
        </div>
        <p className="max-w-[72ch] text-sm text-[var(--text-secondary)]">
          {t(I18nKey.NEOME$SUBTITLE)}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="neome-pick-repository"
            disabled={busy}
            onClick={() => setRepoDialogOpen(true)}
            className="ame-btn-primary ame-btn-sm"
          >
            <GitBranch size={14} aria-hidden />{" "}
            {t(I18nKey.NEOME$PICK_REPOSITORY)}
          </button>
          <button
            type="button"
            data-testid="neome-pick-folder"
            disabled={busy}
            onClick={() => setFolderOpen(true)}
            className="ame-btn-secondary ame-btn-sm"
          >
            <FolderOpen size={14} aria-hidden /> {t(I18nKey.NEOME$PICK_FOLDER)}
          </button>
          {busy ? (
            <span className="self-center text-xs text-[var(--text-tertiary)]">
              {t(I18nKey.NEOME$STARTING)}
            </span>
          ) : null}
        </div>
      </header>

      <section className="flex flex-col gap-3 px-8 pb-8">
        <span className="ame-eyebrow">{t(I18nKey.NEOME$PROJECTS)}</span>
        {list.length === 0 ? (
          <div className="ame-card flex flex-col items-start gap-2 p-6">
            <Plus
              size={18}
              aria-hidden
              className="text-[var(--text-tertiary)]"
            />
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              {t(I18nKey.NEOME$EMPTY_TITLE)}
            </h2>
            <p className="max-w-[60ch] text-sm text-[var(--text-secondary)]">
              {t(I18nKey.NEOME$EMPTY_BODY)}
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.map((project) => (
              <li
                key={project.id}
                data-testid={`neome-project-${project.id}`}
                className="ame-card flex flex-col gap-2 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-base font-semibold text-[var(--text-primary)]">
                      {project.name}
                    </span>
                    <span className="truncate text-xs text-[var(--text-tertiary)]">
                      {sourceLabel(project.source)}
                    </span>
                  </div>
                  <span className="ame-badge ame-badge-neutral shrink-0">
                    {t(statusLabelKey(project.status))}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-xs text-[var(--text-tertiary)]">
                    {project.plan.filter((s) => s.status === "done").length}/
                    {project.plan.length} · {project.components.length}{" "}
                    {t(I18nKey.NEOME$STACK_TITLE).toLowerCase()}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      data-testid={`neome-remove-${project.id}`}
                      aria-label={t(I18nKey.NEOME$DELETE)}
                      onClick={() => removeProject(project.id)}
                      className="ame-btn-icon ame-btn-icon-sm"
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      data-testid={`neome-open-${project.id}`}
                      disabled={!project.conversationId}
                      onClick={() => navigate(`/modernize/${project.id}`)}
                      className="ame-btn-primary ame-btn-xs"
                    >
                      {t(I18nKey.NEOME$OPEN)}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <OpenRepositoryDialog
        isOpen={repoDialogOpen}
        onClose={() => setRepoDialogOpen(false)}
        onConfirm={onRepository}
      />
      <FolderBrowserModal
        isOpen={folderOpen}
        onClose={() => setFolderOpen(false)}
        onAdd={onFolder}
      />
    </main>
  );
}

/* ── Route ─────────────────────────────────────────────────────────────── */

/**
 * Neo ME.
 *
 * `/modernize` lists projects and starts new ones; `/modernize/:projectId`
 * mounts the studio (chat + workbench) on that project's conversation. A
 * top-level route, never co-mounted with `/conversations/:id`: the event
 * stores are global and two live sockets would wipe each other.
 */
function ModernizeScreen() {
  const { t } = useTranslation("openhands");
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId?: string }>();
  const outerNavigation = useNavigation();
  const active = useActiveBackend();
  const project = useModernizationStudioStore((s) =>
    projectId ? s.projects[projectId] : undefined,
  );
  const setActiveProject = useModernizationStudioStore(
    (s) => s.setActiveProject,
  );
  const setStatus = useModernizationStudioStore((s) => s.setStatus);

  React.useEffect(() => {
    setActiveProject(project?.id ?? null);
  }, [project?.id, setActiveProject]);

  // Backend/org switched under a live studio: leave, like the setup studio.
  const mountedBackendId = React.useRef(active.backend.id);
  const mountedOrgId = React.useRef(active.orgId);
  const backendChanged =
    mountedBackendId.current !== active.backend.id ||
    mountedOrgId.current !== active.orgId;
  React.useEffect(() => {
    if (backendChanged) navigate("/modernize", { replace: true });
  }, [backendChanged, navigate]);

  // A restarted agent-server can lose the conversation. Say so instead of
  // mounting a chat on a dead id; the project (plan, checkpoints) survives
  // and can be restarted from the list.
  const conversationId = project?.conversationId ?? null;
  const {
    data: conversation,
    isFetched,
    error,
  } = useUserConversation(conversationId);
  const conversationMissing =
    Boolean(conversationId) && isFetched && !error && !conversation;
  React.useEffect(() => {
    if (conversationMissing && project && project.status !== "failed") {
      setStatus(project.id, "failed");
    }
  }, [conversationMissing, project, setStatus]);

  if (!projectId) return <ProjectsScreen />;

  if (!project || backendChanged) {
    return <main className="p-6" data-testid="neome-missing" />;
  }

  if (!project.conversationId || conversationMissing) {
    return (
      <main
        data-testid="neome-conversation-missing"
        className="flex flex-col items-center justify-center gap-4 p-10 text-center"
      >
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">
          {project.name}
        </h1>
        <p className="max-w-[52ch] text-sm text-[var(--text-secondary)]">
          {t(I18nKey.NEOME$CONVERSATION_MISSING)}
        </p>
        <button
          type="button"
          onClick={() => navigate("/modernize")}
          className="ame-btn-secondary ame-btn-sm"
        >
          {t(I18nKey.NEOME$PROJECTS)}
        </button>
      </main>
    );
  }

  return <StudioShell project={project} outerNavigation={outerNavigation} />;
}

export default ModernizeScreen;
