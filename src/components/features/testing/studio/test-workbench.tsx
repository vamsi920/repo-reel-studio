import React from "react";
import { useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Maximize2, Minimize2 } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import {
  latestReport,
  useTestStudioStore,
  type TestProject,
} from "#/stores/test-studio-store";
import type { PostResultFn } from "#/services/test-control";
import { ChoiceCard, FindingsCard, LiveCard, ReportCard } from "./cards";
import { PlanCard, StackCard } from "./plan-card";
import { ResultsCard } from "./results-card";
import { GatesCard } from "./gates-card";
import { TrendCard } from "./trend-card";
import { ScheduleCard } from "./schedule-card";
import { KtCard } from "./kt-card";
import { MatrixCard } from "./matrix-card";
import type { TestRuntime } from "#/lib/testing/kt";
import type { RunInWorkspace } from "#/lib/modernization/replay-harness";
import { NeoOrb, useTestThinking } from "./thinking";

const STATUS_LABEL_KEY: Record<TestProject["status"], I18nKey> = {
  intake: I18nKey.TESTING$STATUS_INTAKE,
  discovering: I18nKey.TESTING$STATUS_DISCOVERING,
  planning: I18nKey.TESTING$STATUS_PLANNING,
  ready: I18nKey.TESTING$STATUS_READY,
  running: I18nKey.TESTING$STATUS_RUNNING,
  reporting: I18nKey.TESTING$STATUS_REPORTING,
  done: I18nKey.TESTING$STATUS_DONE,
  failed: I18nKey.TESTING$STATUS_FAILED,
};

export function statusLabelKey(status: TestProject["status"]): I18nKey {
  return STATUS_LABEL_KEY[status];
}

/** Key of the last open question, if any (it is scrolled into view). */
export function latestOpenQuestionKey(project: TestProject): string | null {
  const open = project.questions.filter((q) => q.status === "open");
  return open.length ? `question-${open[open.length - 1].id}` : null;
}

/**
 * The panel beside the Neo Test conversation. Top to bottom: what is
 * happening (live), the latest results with the gate verdict, open
 * questions, the plan with Run buttons, gates, findings, the trend, the
 * schedule, the agent's summary. Open questions sit right under the results
 * so the thing to act on is never buried.
 */
export function TestWorkbench({
  projectId,
  postResult,
  onRun,
  busy,
  canRun,
  expanded = false,
  onToggleExpand,
  runtime,
  runInWorkspace,
}: {
  projectId: string;
  postResult: PostResultFn;
  onRun: (suiteIds?: string[]) => void;
  busy: boolean;
  canRun: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  runtime?: TestRuntime;
  runInWorkspace?: RunInWorkspace;
}) {
  const { t } = useTranslation("openhands");
  const reduceMotion = useReducedMotion();
  const project = useTestStudioStore((s) => s.projects[projectId]);
  const thinking = useTestThinking();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const latestOpen = project ? latestOpenQuestionKey(project) : null;

  React.useEffect(() => {
    if (!latestOpen) return undefined;
    const timer = setTimeout(() => {
      scrollRef.current
        ?.querySelector(`[data-card-key="${latestOpen}"]`)
        ?.scrollIntoView?.({
          behavior: reduceMotion ? "auto" : "smooth",
          block: "center",
        });
    }, 220);
    return () => clearTimeout(timer);
  }, [latestOpen, reduceMotion]);

  if (!project) return null;

  const report = latestReport(project);
  const questions = [...project.questions].sort((a, b) => {
    const open = Number(a.status === "open") - Number(b.status === "open");
    return open !== 0 ? open : Date.parse(a.at) - Date.parse(b.at);
  });

  const cards: { key: string; node: React.ReactNode }[] = [
    { key: "live", node: <LiveCard project={project} /> },
    { key: "matrix", node: <MatrixCard project={project} report={report} /> },
    ...(report
      ? [
          {
            key: "results",
            node: (
              <ResultsCard
                report={report}
                runs={project.runs}
                projectName={project.name}
                postResult={postResult}
              />
            ),
          },
        ]
      : []),
    ...questions.map((q) => ({
      key: `question-${q.id}`,
      node: (
        <ChoiceCard
          projectId={project.id}
          question={q}
          postResult={postResult}
        />
      ),
    })),
    {
      key: "kt",
      node: (
        <KtCard
          project={project}
          runtime={runtime}
          runInWorkspace={runInWorkspace}
          postResult={postResult}
        />
      ),
    },
    { key: "stack", node: <StackCard project={project} /> },
    {
      key: "plan",
      node: (
        <PlanCard project={project} busy={busy} canRun={canRun} onRun={onRun} />
      ),
    },
    { key: "gates", node: <GatesCard project={project} report={report} /> },
    ...(project.findings.length
      ? [
          {
            key: "findings",
            node: <FindingsCard project={project} postResult={postResult} />,
          },
        ]
      : []),
    ...(project.runs.some((r) => r.report)
      ? [{ key: "trend", node: <TrendCard project={project} /> }]
      : []),
    ...(project.plan.length
      ? [{ key: "schedule", node: <ScheduleCard project={project} /> }]
      : []),
    ...(project.report
      ? [{ key: "report", node: <ReportCard report={project.report} /> }]
      : []),
  ];

  return (
    <div
      data-testid="testing-workbench"
      className="flex h-full min-h-0 flex-col"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border-color)] px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <span
            className="ame-eyebrow flex items-center gap-1.5"
            data-thinking={thinking}
          >
            <NeoOrb size={14} />
            {t(I18nKey.TESTING$WORKBENCH_TITLE)}
          </span>
          <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
            {project.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            data-testid="testing-status"
            data-status={project.status}
            className="ame-badge ame-badge-neutral"
          >
            {t(STATUS_LABEL_KEY[project.status])}
          </span>
          {onToggleExpand ? (
            <button
              type="button"
              data-testid="testing-expand-toggle"
              aria-pressed={expanded}
              aria-label={
                expanded
                  ? t(I18nKey.TESTING$COLLAPSE_STUDIO)
                  : t(I18nKey.TESTING$EXPAND_STUDIO)
              }
              title={
                expanded
                  ? t(I18nKey.TESTING$COLLAPSE_STUDIO)
                  : t(I18nKey.TESTING$EXPAND_STUDIO)
              }
              onClick={onToggleExpand}
              className="ame-btn-icon ame-btn-icon-sm"
            >
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          ) : null}
        </div>
      </header>
      <div
        ref={scrollRef}
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4",
          expanded && "mx-auto w-full max-w-5xl",
        )}
      >
        {cards.map((card) => (
          <div key={card.key} data-card-key={card.key}>
            {card.node}
          </div>
        ))}
      </div>
    </div>
  );
}
