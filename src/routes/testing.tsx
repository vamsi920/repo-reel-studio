import React from "react";
import { TEST_CONTROL_TOOL_NAME } from "#/constants/test-control";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import {
  ClipboardCheck,
  FlaskConical,
  FolderOpen,
  Gauge,
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
import { isTestReceiptEvent } from "#/utils/test-receipt";
import {
  AUTO_CONTINUE_MESSAGE,
  MID_PLAN_CONTINUE_MESSAGE,
  createTestResultPoster,
  executeRun,
  receipt,
  replayMissedTestCommands,
  shouldAutoContinue,
  shouldContinueMidPlan,
} from "#/services/test-control";
import { useEventStore } from "#/stores/use-event-store";
import { isMessageEvent } from "#/types/agent-server/type-guards";
import { parseMessageFromEvent } from "#/components/conversation-events/chat/event-content-helpers/parse-message-from-event";
import { createWorkspaceRunner } from "#/lib/modernization/replay-harness";
import { useConversationStateStore } from "#/stores/conversation-state-store";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import {
  latestReport,
  useTestStudioStore,
  type ProjectSource,
  type TestProject,
} from "#/stores/test-studio-store";
import {
  TestWorkbench,
  statusLabelKey,
} from "#/components/features/testing/studio/test-workbench";
import { NEOTEST_SYSTEM_BRIEF } from "#/components/features/testing/brief";
import { reportHeadline } from "#/lib/testing/report";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import type { Branch, GitRepository } from "#/types/git";
import type { Provider } from "#/types/settings";
import type { LocalWorkspace } from "#/types/workspace";

/** Per-browser memory of the expanded (full-width) studio layout. */
const EXPANDED_STORAGE_KEY = "testing-studio-expanded";

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
      placeholder: t(I18nKey.TESTING$COMPOSER_PLACEHOLDER),
      hideEvent: isTestReceiptEvent,
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
  project: TestProject,
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
  const progressKey = `${project.stack ? 1 : 0}:${project.plan.length}:${project.runs.length}:${project.findings.length}:${project.log.length}`;
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

/** Dispatches test_control commands that arrived while this tab was away. */
function useReplayMissedCommands(
  project: TestProject,
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
      void replayMissedTestCommands(useEventStore.getState().events, {
        postResult: createTestResultPoster(conversationId),
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
 * A run that was in progress when the tab closed can never finish here
 * (the poller died with the tab); mark it so the Run buttons come back.
 */
function useReconcileStaleRuns(project: TestProject) {
  const updateRun = useTestStudioStore((s) => s.updateRun);
  const setStatus = useTestStudioStore((s) => s.setStatus);
  const done = React.useRef(false);
  React.useEffect(() => {
    if (done.current) return;
    done.current = true;
    for (const run of project.runs) {
      if (run.status === "running") {
        updateRun(project.id, run.id, {
          status: "failed",
          error: "interrupted",
          finishedAt: new Date().toISOString(),
        });
      }
    }
    if (project.status === "running") setStatus(project.id, "ready");
  }, [project.id, project.runs, project.status, updateRun, setStatus]);
}

function StudioPanes({ project }: { project: TestProject }) {
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
  useReconcileStaleRuns(project);

  const { leftWidth, rightWidth, isDragging, containerRef, handleMouseDown } =
    useResizablePanels({
      defaultLeftWidth: 42,
      minLeftWidth: 30,
      maxLeftWidth: 65,
      storageKey: "testing-panel-width",
    });

  const postResult = React.useMemo(
    () => createTestResultPoster(conversationId),
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
  useReplayMissedCommands(
    project,
    conversationId,
    conversationUrl,
    sessionApiKey,
  );
  const onRun = React.useCallback(
    async (suiteIds?: string[]) => {
      setBusy(true);
      try {
        const outcome = await executeRun(project.id, {
          suiteIds,
          triggeredBy: "user",
          runInWorkspace,
        });
        if (!outcome.ok) {
          displayErrorToast(
            outcome.reason === "already_running"
              ? t(I18nKey.TESTING$RUN_ALREADY_RUNNING)
              : t(I18nKey.TESTING$RUN_ERROR),
          );
          return;
        }
        // Tell the agent so it can act on what the user ran.
        postResult(
          receipt({
            status: "run_by_user",
            run_id: outcome.report.runId,
            verdict: outcome.report.gates.verdict,
            headline: reportHeadline(outcome.report),
            guidance:
              "The user ran suites from the studio. Call describe to read the report, fix failures or record findings, then continue.",
          }),
        );
      } finally {
        setBusy(false);
      }
    },
    [project.id, runInWorkspace, postResult, t],
  );

  const workbench = (
    <TestWorkbench
      projectId={project.id}
      postResult={postResult}
      onRun={(ids) => void onRun(ids)}
      busy={busy}
      canRun={Boolean(conversationUrl) || Boolean(conversation)}
      expanded={!isMobile && expanded}
      onToggleExpand={isMobile ? undefined : toggleExpanded}
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
              data-testid={`testing-mobile-tab-${tab}`}
              onClick={() => setMobileTab(tab)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm",
                mobileTab === tab
                  ? "border-[var(--primary-500)] text-[var(--text-primary)]"
                  : "border-transparent text-[var(--text-tertiary)]",
              )}
            >
              {tab === "chat"
                ? t(I18nKey.TESTING$MOBILE_CHAT)
                : t(I18nKey.TESTING$MOBILE_WORKBENCH)}
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
        className={cn("flex min-h-0 min-w-0 flex-col", expanded && "hidden")}
      >
        <StudioChat />
      </div>
      {expanded ? null : (
        <ResizeHandle onMouseDown={handleMouseDown} isDragging={isDragging} />
      )}
      <div
        style={{ width: expanded ? "100%" : `${rightWidth}%` }}
        data-testid="testing-workbench-pane"
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
  project: TestProject;
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
            data-testid="testing-studio"
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
  return {
    repository: {
      name: source.name,
      gitProvider: (source.gitProvider ?? "github") as Provider,
      branch: source.branch,
    },
  };
}

function useLaunchTestConversation() {
  const { t } = useTranslation("openhands");
  const { mutateAsync: createConversation } = useCreateConversation();
  const setConversationId = useTestStudioStore((s) => s.setConversationId);
  return React.useCallback(
    async (project: TestProject, query: string) => {
      const created = await createConversation({
        ...variablesForSource(project.source),
        query,
        extraSystemSuffix: NEOTEST_SYSTEM_BRIEF,
        studioTool: TEST_CONTROL_TOOL_NAME,
        entryPoint: "testing_studio",
      });
      setConversationId(project.id, created.conversation_id);
      void AgentServerConversationService.updateConversationTitle(
        created.conversation_id,
        t(I18nKey.TESTING$STUDIO_CONVERSATION_TITLE, { name: project.name }),
      ).catch(() => {});
      return created.conversation_id;
    },
    [createConversation, setConversationId, t],
  );
}

function RestartConversation({ project }: { project: TestProject }) {
  const { t } = useTranslation("openhands");
  const navigate = useNavigate();
  const launch = useLaunchTestConversation();
  const setStatus = useTestStudioStore((s) => s.setStatus);
  const [restarting, setRestarting] = React.useState(false);

  const restart = async () => {
    setRestarting(true);
    try {
      await launch(project, t(I18nKey.TESTING$RESTART_PROMPT));
      setStatus(
        project.id,
        project.report ? "done" : project.plan.length ? "ready" : "discovering",
      );
    } catch (error) {
      displayErrorToast(
        error instanceof Error && error.message
          ? error.message
          : t(I18nKey.TESTING$START_ERROR),
      );
    } finally {
      setRestarting(false);
    }
  };

  return (
    <main
      data-testid="testing-conversation-missing"
      className="flex flex-col items-center justify-center gap-4 p-10 text-center"
    >
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">
        {project.name}
      </h1>
      <p className="max-w-[52ch] text-sm text-[var(--text-secondary)]">
        {t(I18nKey.TESTING$CONVERSATION_MISSING)}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => navigate("/testing")}
          className="ame-btn-secondary ame-btn-sm"
        >
          {t(I18nKey.TESTING$PROJECTS)}
        </button>
        <button
          type="button"
          data-testid="testing-restart-conversation"
          disabled={restarting}
          onClick={() => void restart()}
          className="ame-btn-primary ame-btn-sm"
        >
          {restarting
            ? t(I18nKey.TESTING$STARTING)
            : t(I18nKey.TESTING$RESTART_CONVERSATION)}
        </button>
      </div>
    </main>
  );
}

/* ── Project list / intake ─────────────────────────────────────────────── */

function sourceLabel(source: ProjectSource): string {
  return source.kind === "repository"
    ? `${source.name}${source.branch ? `@${source.branch}` : ""}`
    : source.name;
}

function HowItWorks() {
  const { t } = useTranslation("openhands");
  const steps = [
    {
      icon: Workflow,
      title: t(I18nKey.TESTING$HOW_1_TITLE),
      body: t(I18nKey.TESTING$HOW_1_BODY),
    },
    {
      icon: ClipboardCheck,
      title: t(I18nKey.TESTING$HOW_2_TITLE),
      body: t(I18nKey.TESTING$HOW_2_BODY),
    },
    {
      icon: Gauge,
      title: t(I18nKey.TESTING$HOW_3_TITLE),
      body: t(I18nKey.TESTING$HOW_3_BODY),
    },
    {
      icon: ShieldCheck,
      title: t(I18nKey.TESTING$HOW_4_TITLE),
      body: t(I18nKey.TESTING$HOW_4_BODY),
    },
  ];
  return (
    <ol
      data-testid="testing-how-it-works"
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

const VERDICT_BADGE: Record<string, string> = {
  passed: "ame-badge ame-badge-success",
  failed: "ame-badge ame-badge-danger",
  warned: "ame-badge ame-badge-warning",
  not_measured: "ame-badge ame-badge-neutral",
};

function ProjectsScreen() {
  const { t } = useTranslation("openhands");
  const navigate = useNavigate();
  const active = useActiveBackend();
  const projects = useTestStudioStore((s) => s.projects);
  const createProject = useTestStudioStore((s) => s.createProject);
  const removeProject = useTestStudioStore((s) => s.removeProject);
  const launch = useLaunchTestConversation();
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

  const startProject = async (name: string, source: ProjectSource) => {
    setStarting(true);
    const project = createProject({ name, source });
    try {
      await launch(project, t(I18nKey.TESTING$START_PROMPT));
      navigate(`/testing/${project.id}`);
    } catch (error) {
      removeProject(project.id);
      displayErrorToast(
        error instanceof Error && error.message
          ? error.message
          : t(I18nKey.TESTING$START_ERROR),
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
        data-testid="testing-cloud-unsupported"
        className="flex flex-col items-center justify-center gap-4 p-10 text-center"
      >
        <FlaskConical
          size={24}
          aria-hidden
          className="text-[var(--primary-500)]"
        />
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">
          {t(I18nKey.TESTING$TITLE)}
        </h1>
        <p className="max-w-[52ch] text-sm text-[var(--text-secondary)]">
          {t(I18nKey.TESTING$CLOUD_UNSUPPORTED)}
        </p>
      </main>
    );
  }

  return (
    <main
      data-testid="testing-projects"
      className="flex h-full min-h-0 flex-col overflow-y-auto"
    >
      <header className="flex flex-col gap-2 px-8 pt-8 pb-4">
        <div className="flex items-center gap-2">
          <FlaskConical
            size={22}
            aria-hidden
            className="text-[var(--primary-500)]"
          />
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
            {t(I18nKey.TESTING$TITLE)}
          </h1>
        </div>
        <p className="max-w-[72ch] text-sm text-[var(--text-secondary)]">
          {t(I18nKey.TESTING$SUBTITLE)}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="testing-pick-repository"
            disabled={starting}
            onClick={() => setRepoDialogOpen(true)}
            className="ame-btn-primary ame-btn-sm"
          >
            <GitBranch size={14} aria-hidden />{" "}
            {t(I18nKey.TESTING$PICK_REPOSITORY)}
          </button>
          <button
            type="button"
            data-testid="testing-pick-folder"
            disabled={starting}
            onClick={() => setFolderOpen(true)}
            className="ame-btn-secondary ame-btn-sm"
          >
            <FolderOpen size={14} aria-hidden />{" "}
            {t(I18nKey.TESTING$PICK_FOLDER)}
          </button>
          {starting ? (
            <span className="self-center text-xs text-[var(--text-tertiary)]">
              {t(I18nKey.TESTING$STARTING)}
            </span>
          ) : null}
        </div>
      </header>

      <section className="flex flex-col gap-3 px-8 pb-6">
        <span className="ame-eyebrow">{t(I18nKey.TESTING$HOW_TITLE)}</span>
        <HowItWorks />
      </section>

      <section className="flex flex-col gap-3 px-8 pb-8">
        <span className="ame-eyebrow">{t(I18nKey.TESTING$PROJECTS)}</span>
        {list.length === 0 ? (
          <div className="ame-card flex flex-col items-start gap-2 p-6">
            <Plus
              size={18}
              aria-hidden
              className="text-[var(--text-tertiary)]"
            />
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              {t(I18nKey.TESTING$EMPTY_TITLE)}
            </h2>
            <p className="max-w-[60ch] text-sm text-[var(--text-secondary)]">
              {t(I18nKey.TESTING$EMPTY_BODY)}
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.map((project) => {
              const report = latestReport(project);
              return (
                <li
                  key={project.id}
                  data-testid={`testing-project-${project.id}`}
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
                  {report ? (
                    <div
                      data-testid={`testing-project-verdict-${project.id}`}
                      className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]"
                    >
                      <span className={VERDICT_BADGE[report.gates.verdict]}>
                        {report.gates.verdict}
                      </span>
                      <span className="truncate">{reportHeadline(report)}</span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-xs text-[var(--text-tertiary)]">
                      {t(I18nKey.TESTING$PROJECT_SUMMARY, {
                        suites: project.plan.filter((s) => !s.notApplicable)
                          .length,
                        runs: project.runs.length,
                      })}
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        data-testid={`testing-remove-${project.id}`}
                        aria-label={t(I18nKey.TESTING$DELETE)}
                        onClick={() => removeProject(project.id)}
                        className="ame-btn-icon ame-btn-icon-sm"
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                      <button
                        type="button"
                        data-testid={`testing-open-${project.id}`}
                        disabled={!project.conversationId}
                        onClick={() => navigate(`/testing/${project.id}`)}
                        className="ame-btn-primary ame-btn-xs"
                      >
                        {t(I18nKey.TESTING$OPEN)}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
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
 * Neo Test.
 *
 * `/testing` lists projects and starts new ones; `/testing/:projectId`
 * mounts the studio (chat + workbench) on that project's conversation. A
 * top-level route, never co-mounted with `/conversations/:id` (global event
 * stores).
 */
function TestingScreen() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId?: string }>();
  const outerNavigation = useNavigation();
  const active = useActiveBackend();
  const project = useTestStudioStore((s) =>
    projectId ? s.projects[projectId] : undefined,
  );
  const setActiveProject = useTestStudioStore((s) => s.setActiveProject);
  const setStatus = useTestStudioStore((s) => s.setStatus);

  React.useEffect(() => {
    setActiveProject(project?.id ?? null);
  }, [project?.id, setActiveProject]);

  const mountedBackendId = React.useRef(active.backend.id);
  const mountedOrgId = React.useRef(active.orgId);
  const backendChanged =
    mountedBackendId.current !== active.backend.id ||
    mountedOrgId.current !== active.orgId;
  React.useEffect(() => {
    if (backendChanged) navigate("/testing", { replace: true });
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
    return <main className="p-6" data-testid="testing-missing" />;
  if (!project.conversationId || conversationMissing)
    return <RestartConversation project={project} />;
  return <StudioShell project={project} outerNavigation={outerNavigation} />;
}

export default TestingScreen;
