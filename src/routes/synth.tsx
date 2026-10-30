import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import {
  Database,
  Dices,
  FileText,
  FolderOpen,
  GitBranch,
  Plus,
  ShieldCheck,
  Trash2,
  Workflow,
} from "lucide-react";
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
import { OpenRepositoryDialog } from "#/components/features/home/open-repository-dialog";
import { FolderBrowserModal } from "#/components/features/home/workspace-dropdown/folder-browser-modal";
import { isSynthReceiptEvent } from "#/utils/synth-receipt";
import {
  AUTO_CONTINUE_MESSAGE,
  MID_PLAN_CONTINUE_MESSAGE,
  createSynthResultPoster,
  receipt,
  replayMissedSynthCommands,
  runGeneration,
  shouldAutoContinue,
  shouldContinueMidPlan,
  type GenerateRequest,
} from "#/services/synth-control";
import { useEventStore } from "#/stores/use-event-store";
import { isMessageEvent } from "#/types/agent-server/type-guards";
import { parseMessageFromEvent } from "#/components/conversation-events/chat/event-content-helpers/parse-message-from-event";
import { createWorkspaceRunner } from "#/lib/modernization/replay-harness";
import { useConversationStateStore } from "#/stores/conversation-state-store";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import {
  useSynthStudioStore,
  type ProjectSource,
  type SynthProject,
} from "#/stores/synth-studio-store";
import {
  SynthWorkbench,
  statusLabelKey,
} from "#/components/features/synth/studio/synth-workbench";
import { SYNTH_SYSTEM_BRIEF } from "#/components/features/synth/brief";
import {
  DocumentIntakeDialog,
  type PickedDocument,
} from "#/components/features/synth/document-intake-dialog";
import { flushDocuments, ingestDocument } from "#/services/synth-documents";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import type { Branch, GitRepository } from "#/types/git";
import type { Provider } from "#/types/settings";
import type { LocalWorkspace } from "#/types/workspace";

/** Per-browser memory of the expanded (full-width) studio layout. */
const EXPANDED_STORAGE_KEY = "synth-studio-expanded";

function readExpanded(): boolean {
  try {
    return localStorage.getItem(EXPANDED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeExpanded(value: boolean) {
  try {
    localStorage.setItem(EXPANDED_STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Storage blocked: the toggle still works for this visit.
  }
}

/** Tab ids for the mobile layout; not user-facing text. */
const MOBILE_TABS = ["chat", "workbench"] as const;

/** The shared chat without the coding chrome; receipts stay hidden. */
function StudioChat() {
  const { t } = useTranslation("openhands");
  const surface = React.useMemo(
    () => ({
      showGitControls: false,
      placeholder: t(I18nKey.SYNTH$COMPOSER_PLACEHOLDER),
      hideEvent: isSynthReceiptEvent,
    }),
    [t],
  );
  return (
    <ChatSurfaceProvider value={surface}>
      <ChatInterface />
    </ChatSurfaceProvider>
  );
}

/**
 * Keeps the run moving: one nudge when the agent goes idle right after the
 * user answered a card, and one nudge per idle period when it stops mid-work
 * with nothing waiting on the user (see shouldContinueMidPlan).
 */
function useStudioAutoContinue(
  project: SynthProject,
  sendUserMessage: (text: string) => Promise<unknown>,
) {
  const executionStatus = useConversationStateStore((s) => s.execution_status);
  const lastReceiptAtRef = React.useRef<number | null>(null);
  const nudgedForRef = React.useRef<number | null>(null);
  const answeredCount = project.questions.filter(
    (q) => q.status === "answered",
  ).length;
  const seenRef = React.useRef(answeredCount);
  React.useEffect(() => {
    if (answeredCount > seenRef.current) lastReceiptAtRef.current = Date.now();
    seenRef.current = answeredCount;
  }, [answeredCount]);

  // Idle periods: each transition into idle gets its own id (the time), so
  // the mid-plan nudge fires at most once per stop.
  const agentIdle =
    executionStatus === ExecutionStatus.FINISHED ||
    executionStatus === ExecutionStatus.IDLE;
  const [idleAt, setIdleAt] = React.useState<number | null>(null);
  React.useEffect(() => {
    setIdleAt(agentIdle ? Date.now() : null);
  }, [agentIdle]);
  const lastAgentText = useEventStore((state) => {
    for (let i = state.events.length - 1; i >= 0; i -= 1) {
      const event = state.events[i];
      if (isMessageEvent(event) && event.source === "agent") {
        return parseMessageFromEvent(event);
      }
    }
    return null;
  });
  // Progress resets the give-up counter: entities, rules, runs, log lines.
  const progressKey = `${project.model.entities.length}:${project.model.rules.length}:${project.runs.length}:${project.log.length}`;
  const midPlanRef = React.useRef({
    nudgedForIdleAt: null as number | null,
    nudges: 0,
    progressKey,
  });
  if (midPlanRef.current.progressKey !== progressKey) {
    midPlanRef.current = { ...midPlanRef.current, nudges: 0, progressKey };
  }

  React.useEffect(() => {
    const lastReceiptAt = lastReceiptAtRef.current;
    if (
      shouldAutoContinue({
        agentIdle,
        lastReceiptAt,
        nudgedForReceiptAt: nudgedForRef.current,
        now: Date.now(),
        project,
      })
    ) {
      nudgedForRef.current = lastReceiptAt;
      midPlanRef.current.nudgedForIdleAt = idleAt;
      const timer = setTimeout(() => {
        void sendUserMessage(AUTO_CONTINUE_MESSAGE).catch(() => {});
      }, 2500);
      return () => clearTimeout(timer);
    }
    const midPlan = midPlanRef.current;
    if (
      shouldContinueMidPlan({
        agentIdle,
        idleAt,
        nudgedForIdleAt: midPlan.nudgedForIdleAt,
        nudgesWithoutProgress: midPlan.nudges,
        lastAgentText,
        project,
      })
    ) {
      // Wait a little: a receipt or the user may be about to arrive.
      const timer = setTimeout(() => {
        midPlan.nudgedForIdleAt = idleAt;
        midPlan.nudges += 1;
        void sendUserMessage(MID_PLAN_CONTINUE_MESSAGE).catch(() => {});
      }, 4000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [agentIdle, idleAt, lastAgentText, project, sendUserMessage]);
}

/**
 * Dispatches synth_control commands that arrived while this tab was away
 * (reload, HMR, closed): once the loaded history stops changing, every
 * unhandled action is replayed through the normal dispatcher.
 */
function useReplayMissedCommands(
  project: SynthProject,
  conversationId: string,
  conversationUrl: string | null,
  sessionApiKey: string | null,
) {
  const eventCount = useEventStore((s) => s.events.length);
  const replayedRef = React.useRef(false);
  React.useEffect(() => {
    if (replayedRef.current || eventCount === 0) return undefined;
    const timer = setTimeout(() => {
      replayedRef.current = true;
      void replayMissedSynthCommands(useEventStore.getState().events, {
        postResult: createSynthResultPoster(conversationId),
        conversationId,
        runInWorkspace: createWorkspaceRunner(
          conversationId,
          conversationUrl,
          sessionApiKey,
        ),
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [eventCount, conversationId, conversationUrl, sessionApiKey, project.id]);
}

/**
 * Writes documents uploaded before the conversation had a runtime into its
 * workspace, retrying while the runtime starts (a few seconds on a cold
 * agent-server).
 */
function useFlushDocuments(
  project: SynthProject,
  runInWorkspace: ReturnType<typeof createWorkspaceRunner>,
) {
  const pending = (project.documents ?? []).filter(
    (d) => !d.workspacePath,
  ).length;
  React.useEffect(() => {
    if (pending === 0) return undefined;
    let cancelled = false;
    let attempt = 0;
    const tick = async () => {
      if (cancelled) return;
      attempt += 1;
      const written = await flushDocuments(project.id, runInWorkspace).catch(
        () => [] as string[],
      );
      if (!cancelled && written.length === 0 && attempt < 10) {
        timer = setTimeout(() => void tick(), 3000);
      }
    };
    let timer = setTimeout(() => void tick(), 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pending, project.id, runInWorkspace]);
}

function StudioPanes({ project }: { project: SynthProject }) {
  const { t } = useTranslation("openhands");
  const isMobile = useBreakpoint();
  const [mobileTab, setMobileTab] = React.useState<"chat" | "workbench">(
    "chat",
  );
  const [busy, setBusy] = React.useState(false);
  const [expanded, setExpanded] = React.useState(readExpanded);
  const toggleExpanded = React.useCallback(() => {
    setExpanded((v) => {
      writeExpanded(!v);
      return !v;
    });
  }, []);
  const conversationId = project.conversationId!;
  const { data: conversation } = useUserConversation(conversationId);
  useTrackRealUsage();

  const { leftWidth, rightWidth, isDragging, containerRef, handleMouseDown } =
    useResizablePanels({
      defaultLeftWidth: 42,
      minLeftWidth: 30,
      maxLeftWidth: 65,
      storageKey: "synth-panel-width",
    });

  const postResult = React.useMemo(
    () => createSynthResultPoster(conversationId),
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
  useStudioAutoContinue(project, sendUserMessage);

  const conversationUrl = conversation?.conversation_url ?? null;
  const sessionApiKey = conversation?.session_api_key ?? null;
  const runInWorkspace = React.useMemo(
    () => createWorkspaceRunner(conversationId, conversationUrl, sessionApiKey),
    [conversationId, conversationUrl, sessionApiKey],
  );
  useFlushDocuments(project, runInWorkspace);
  useReplayMissedCommands(
    project,
    conversationId,
    conversationUrl,
    sessionApiKey,
  );
  const onGenerate = React.useCallback(
    async (request: GenerateRequest) => {
      setBusy(true);
      try {
        const outcome = await runGeneration(project.id, request, {
          runInWorkspace: createWorkspaceRunner(
            conversationId,
            conversationUrl,
            sessionApiKey,
          ),
          triggeredBy: "user",
        });
        if (!outcome.ok) {
          displayErrorToast(
            outcome.reason === "model_invalid"
              ? t(I18nKey.SYNTH$MODEL_PROBLEMS)
              : t(I18nKey.SYNTH$ACTION_ERROR),
          );
          return;
        }
        // Tell the agent so it can verify (load / test) what the user made.
        postResult(
          receipt({
            status: "generated_by_user",
            run_id: outcome.run.id,
            scenario: outcome.run.scenarioId,
            seed: outcome.run.seed,
            rows_total: outcome.run.rowsTotal,
            valid: outcome.run.validation.ok,
            dir: outcome.run.workspaceDir,
            guidance:
              "The user generated this run from the studio. If the data is valid, load it into the application (seed.*.sql / data/*.json) and run the tests, then call report_verification with the real numbers.",
          }),
        );
      } finally {
        setBusy(false);
      }
    },
    [project.id, conversationId, conversationUrl, sessionApiKey, postResult, t],
  );

  const workbench = (
    <SynthWorkbench
      projectId={project.id}
      postResult={postResult}
      onGenerate={onGenerate}
      busy={busy}
      expanded={!isMobile && expanded}
      onToggleExpand={isMobile ? undefined : toggleExpanded}
      runInWorkspace={runInWorkspace}
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
              data-testid={`synth-mobile-tab-${tab}`}
              onClick={() => setMobileTab(tab)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm",
                mobileTab === tab
                  ? "border-[var(--primary-500)] text-[var(--text-primary)]"
                  : "border-transparent text-[var(--text-tertiary)]",
              )}
            >
              {tab === "chat"
                ? t(I18nKey.SYNTH$MOBILE_CHAT)
                : t(I18nKey.SYNTH$MOBILE_WORKBENCH)}
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
      {/* Hidden, not unmounted, when expanded: the chat keeps its scroll. */}
      <div
        style={{ width: `${leftWidth}%` }}
        className={cn("flex min-h-0 min-w-0 flex-col", expanded && "hidden")}
      >
        <StudioChat />
      </div>
      {expanded ? null : (
        <ResizeHandle onMouseDown={handleMouseDown} isDragging={isDragging} />
      )}
      <div
        style={{ width: expanded ? "100%" : `${rightWidth}%` }}
        data-testid="synth-workbench-pane"
        data-expanded={expanded}
        className="min-h-0 min-w-0"
      >
        {workbench}
      </div>
    </div>
  );
}

/** Overrides `NavigationContext.conversationId` for the prop-less chat tree. */
function StudioShell({
  project,
  outerNavigation,
}: {
  project: SynthProject;
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
            data-testid="synth-studio"
            className="flex h-full min-h-0 flex-col"
          >
            <StudioPanes project={project} />
          </main>
        </EventHandler>
      </WebSocketProviderWrapper>
    </NavigationProvider>
  );
}

/* ── Conversation launch ───────────────────────────────────────────────── */

type CreateVariables = Parameters<
  ReturnType<typeof useCreateConversation>["mutateAsync"]
>[0];

function variablesForSource(source: ProjectSource): CreateVariables {
  if (source.kind === "folder") return { workingDir: source.name };
  // No codebase: the agent works in the default workspace, where the
  // documents are written under synth-input/<project>/.
  if (source.kind === "document") return {};
  return {
    repository: {
      name: source.name,
      gitProvider: (source.gitProvider ?? "github") as Provider,
      branch: source.branch,
    },
  };
}

function useLaunchSynthConversation() {
  const { t } = useTranslation("openhands");
  const { mutateAsync: createConversation } = useCreateConversation();
  const setConversationId = useSynthStudioStore((s) => s.setConversationId);
  return React.useCallback(
    async (project: SynthProject, query: string) => {
      const created = await createConversation({
        ...variablesForSource(project.source),
        query,
        extraSystemSuffix: SYNTH_SYSTEM_BRIEF,
        entryPoint: "synth_studio",
      });
      setConversationId(project.id, created.conversation_id);
      void AgentServerConversationService.updateConversationTitle(
        created.conversation_id,
        t(I18nKey.SYNTH$STUDIO_CONVERSATION_TITLE, { name: project.name }),
      ).catch(() => {});
      return created.conversation_id;
    },
    [createConversation, setConversationId, t],
  );
}

function RestartConversation({ project }: { project: SynthProject }) {
  const { t } = useTranslation("openhands");
  const navigate = useNavigate();
  const launch = useLaunchSynthConversation();
  const setStatus = useSynthStudioStore((s) => s.setStatus);
  const [restarting, setRestarting] = React.useState(false);

  const restart = async () => {
    setRestarting(true);
    try {
      await launch(project, t(I18nKey.SYNTH$RESTART_PROMPT));
      setStatus(
        project.id,
        project.report
          ? "done"
          : project.model.entities.length
            ? "ready"
            : "discovering",
      );
    } catch (error) {
      displayErrorToast(
        error instanceof Error && error.message
          ? error.message
          : t(I18nKey.SYNTH$START_ERROR),
      );
    } finally {
      setRestarting(false);
    }
  };

  return (
    <main
      data-testid="synth-conversation-missing"
      className="flex flex-col items-center justify-center gap-4 p-10 text-center"
    >
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">
        {project.name}
      </h1>
      <p className="max-w-[52ch] text-sm text-[var(--text-secondary)]">
        {t(I18nKey.SYNTH$CONVERSATION_MISSING)}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => navigate("/synth")}
          className="ame-btn-secondary ame-btn-sm"
        >
          {t(I18nKey.SYNTH$PROJECTS)}
        </button>
        <button
          type="button"
          data-testid="synth-restart-conversation"
          disabled={restarting}
          onClick={() => void restart()}
          className="ame-btn-primary ame-btn-sm"
        >
          {restarting
            ? t(I18nKey.SYNTH$STARTING)
            : t(I18nKey.SYNTH$RESTART_CONVERSATION)}
        </button>
      </div>
    </main>
  );
}

/* ── Project list / intake ─────────────────────────────────────────────── */

function sourceLabel(source: ProjectSource): string {
  if (source.kind === "document") return source.name;
  return source.kind === "repository"
    ? `${source.name}${source.branch ? `@${source.branch}` : ""}`
    : source.name;
}

function HowItWorks() {
  const { t } = useTranslation("openhands");
  const steps = [
    {
      icon: Database,
      title: t(I18nKey.SYNTH$HOW_1_TITLE),
      body: t(I18nKey.SYNTH$HOW_1_BODY),
    },
    {
      icon: Workflow,
      title: t(I18nKey.SYNTH$HOW_2_TITLE),
      body: t(I18nKey.SYNTH$HOW_2_BODY),
    },
    {
      icon: Dices,
      title: t(I18nKey.SYNTH$HOW_3_TITLE),
      body: t(I18nKey.SYNTH$HOW_3_BODY),
    },
    {
      icon: ShieldCheck,
      title: t(I18nKey.SYNTH$HOW_4_TITLE),
      body: t(I18nKey.SYNTH$HOW_4_BODY),
    },
  ];
  return (
    <ol
      data-testid="synth-how-it-works"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      {steps.map((step, i) => (
        <li key={step.title} className="ame-card flex flex-col gap-1.5 p-4">
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary-bg-subtle)] text-xs font-semibold text-[var(--primary-600)]">
              {i + 1}
            </span>
            <step.icon
              size={14}
              aria-hidden
              className="text-[var(--primary-500)]"
            />
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {step.title}
            </span>
          </span>
          <p className="text-xs text-[var(--text-secondary)]">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}

function ProjectsScreen() {
  const { t } = useTranslation("openhands");
  const navigate = useNavigate();
  const active = useActiveBackend();
  const projects = useSynthStudioStore((s) => s.projects);
  const createProject = useSynthStudioStore((s) => s.createProject);
  const removeProject = useSynthStudioStore((s) => s.removeProject);
  const launch = useLaunchSynthConversation();
  const [repoDialogOpen, setRepoDialogOpen] = React.useState(false);
  const [folderOpen, setFolderOpen] = React.useState(false);
  const [documentOpen, setDocumentOpen] = React.useState(false);
  const [starting, setStarting] = React.useState(false);

  const list = React.useMemo(
    () =>
      Object.values(projects).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    [projects],
  );

  const startProject = async (name: string, source: ProjectSource) => {
    setStarting(true);
    const project = createProject({ name, source });
    try {
      await launch(project, t(I18nKey.SYNTH$START_PROMPT));
      navigate(`/synth/${project.id}`);
    } catch (error) {
      removeProject(project.id);
      displayErrorToast(
        error instanceof Error && error.message
          ? error.message
          : t(I18nKey.SYNTH$START_ERROR),
      );
    } finally {
      setStarting(false);
    }
  };

  // Documents are read and merged before the conversation starts, so the
  // studio opens on a model and the agent's first describe sees it.
  const startDocumentProject = async (
    name: string,
    documents: PickedDocument[],
  ) => {
    setStarting(true);
    const project = createProject({
      name,
      source: {
        kind: "document",
        name: documents
          .map((d) => d.name)
          .join(", ")
          .slice(0, 200),
      },
    });
    try {
      for (const doc of documents) {
        await ingestDocument(
          project.id,
          { name: doc.name, bytes: doc.bytes },
          { addedBy: "user" },
        );
      }
      await launch(project, t(I18nKey.SYNTH$DOC_START_PROMPT));
      setDocumentOpen(false);
      navigate(`/synth/${project.id}`);
    } catch (error) {
      removeProject(project.id);
      displayErrorToast(
        error instanceof Error && error.message
          ? error.message
          : t(I18nKey.SYNTH$START_ERROR),
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
    void startProject(name, {
      kind: "repository",
      name: selection.repository.full_name,
      branch: selection.branch.name,
      gitProvider: selection.provider ?? selection.repository.git_provider,
    });
  };

  const onFolder = (items: LocalWorkspace[]) => {
    setFolderOpen(false);
    const folder = items[0];
    if (!folder) return;
    void startProject(folder.name, { kind: "folder", name: folder.path });
  };

  if (active.backend.kind === "cloud") {
    return (
      <main
        data-testid="synth-cloud-unsupported"
        className="flex flex-col items-center justify-center gap-4 p-10 text-center"
      >
        <Dices size={24} aria-hidden className="text-[var(--primary-500)]" />
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">
          {t(I18nKey.SYNTH$TITLE)}
        </h1>
        <p className="max-w-[52ch] text-sm text-[var(--text-secondary)]">
          {t(I18nKey.SYNTH$CLOUD_UNSUPPORTED)}
        </p>
      </main>
    );
  }

  return (
    <main
      data-testid="synth-projects"
      className="flex h-full min-h-0 flex-col overflow-y-auto"
    >
      <header className="flex flex-col gap-2 px-8 pt-8 pb-4">
        <div className="flex items-center gap-2">
          <Dices size={22} aria-hidden className="text-[var(--primary-500)]" />
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
            {t(I18nKey.SYNTH$TITLE)}
          </h1>
        </div>
        <p className="max-w-[72ch] text-sm text-[var(--text-secondary)]">
          {t(I18nKey.SYNTH$SUBTITLE)}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="synth-pick-repository"
            disabled={starting}
            onClick={() => setRepoDialogOpen(true)}
            className="ame-btn-primary ame-btn-sm"
          >
            <GitBranch size={14} aria-hidden />{" "}
            {t(I18nKey.SYNTH$PICK_REPOSITORY)}
          </button>
          <button
            type="button"
            data-testid="synth-pick-folder"
            disabled={starting}
            onClick={() => setFolderOpen(true)}
            className="ame-btn-secondary ame-btn-sm"
          >
            <FolderOpen size={14} aria-hidden /> {t(I18nKey.SYNTH$PICK_FOLDER)}
          </button>
          <button
            type="button"
            data-testid="synth-pick-document"
            disabled={starting}
            onClick={() => setDocumentOpen(true)}
            className="ame-btn-secondary ame-btn-sm"
          >
            <FileText size={14} aria-hidden /> {t(I18nKey.SYNTH$PICK_DOCUMENT)}
          </button>
          {starting ? (
            <span className="self-center text-xs text-[var(--text-tertiary)]">
              {t(I18nKey.SYNTH$STARTING)}
            </span>
          ) : null}
        </div>
      </header>

      <section className="flex flex-col gap-3 px-8 pb-6">
        <span className="ame-eyebrow">{t(I18nKey.SYNTH$HOW_TITLE)}</span>
        <HowItWorks />
      </section>

      <section className="flex flex-col gap-3 px-8 pb-8">
        <span className="ame-eyebrow">{t(I18nKey.SYNTH$PROJECTS)}</span>
        {list.length === 0 ? (
          <div className="ame-card flex flex-col items-start gap-2 p-6">
            <Plus
              size={18}
              aria-hidden
              className="text-[var(--text-tertiary)]"
            />
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              {t(I18nKey.SYNTH$EMPTY_TITLE)}
            </h2>
            <p className="max-w-[60ch] text-sm text-[var(--text-secondary)]">
              {t(I18nKey.SYNTH$EMPTY_BODY)}
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.map((project) => (
              <li
                key={project.id}
                data-testid={`synth-project-${project.id}`}
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
                    {t(I18nKey.SYNTH$PROJECT_SUMMARY, {
                      entities: project.model.entities.length,
                      runs: project.runs.length,
                    })}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      data-testid={`synth-remove-${project.id}`}
                      aria-label={t(I18nKey.SYNTH$DELETE)}
                      onClick={() => removeProject(project.id)}
                      className="ame-btn-icon ame-btn-icon-sm"
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      data-testid={`synth-open-${project.id}`}
                      disabled={!project.conversationId}
                      onClick={() => navigate(`/synth/${project.id}`)}
                      className="ame-btn-primary ame-btn-xs"
                    >
                      {t(I18nKey.SYNTH$OPEN)}
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
      <DocumentIntakeDialog
        isOpen={documentOpen}
        busy={starting}
        onClose={() => setDocumentOpen(false)}
        onConfirm={(name, documents) =>
          void startDocumentProject(name, documents)
        }
      />
    </main>
  );
}

/* ── Route ─────────────────────────────────────────────────────────────── */

/**
 * Neo Synth.
 *
 * `/synth` lists projects and starts new ones; `/synth/:projectId` mounts the
 * studio (chat + workbench) on that project's conversation. A top-level
 * route, never co-mounted with `/conversations/:id` (global event stores).
 */
function SynthScreen() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId?: string }>();
  const outerNavigation = useNavigation();
  const active = useActiveBackend();
  const project = useSynthStudioStore((s) =>
    projectId ? s.projects[projectId] : undefined,
  );
  const setActiveProject = useSynthStudioStore((s) => s.setActiveProject);
  const setStatus = useSynthStudioStore((s) => s.setStatus);

  React.useEffect(() => {
    setActiveProject(project?.id ?? null);
  }, [project?.id, setActiveProject]);

  const mountedBackendId = React.useRef(active.backend.id);
  const mountedOrgId = React.useRef(active.orgId);
  const backendChanged =
    mountedBackendId.current !== active.backend.id ||
    mountedOrgId.current !== active.orgId;
  React.useEffect(() => {
    if (backendChanged) navigate("/synth", { replace: true });
  }, [backendChanged, navigate]);

  const conversationId = project?.conversationId ?? null;
  const {
    data: conversation,
    isFetched,
    error,
  } = useUserConversation(conversationId);
  const conversationMissing =
    Boolean(conversationId) && isFetched && !error && !conversation;
  React.useEffect(() => {
    if (conversationMissing && project && project.status !== "failed")
      setStatus(project.id, "failed");
  }, [conversationMissing, project, setStatus]);

  if (!projectId) return <ProjectsScreen />;
  if (!project || backendChanged)
    return <main className="p-6" data-testid="synth-missing" />;
  if (!project.conversationId || conversationMissing)
    return <RestartConversation project={project} />;
  return <StudioShell project={project} outerNavigation={outerNavigation} />;
}

export default SynthScreen;
