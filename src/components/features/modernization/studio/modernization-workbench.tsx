import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import {
  useModernizationStudioStore,
  type ApprovalRequest,
  type ChoiceQuestion,
  type ModernizationProject,
} from "#/stores/modernization-studio-store";
import type { PostResultFn } from "#/services/modernization-control";
import {
  ApprovalCard,
  ChoiceCard,
  PlanCard,
  ReportCard,
  StackCard,
} from "./cards";
import { LiveMigrationCard } from "./live-migration-card";
import { NeoOrb, useNeoMeThinking } from "./thinking";

const STATUS_LABEL_KEY: Record<ModernizationProject["status"], I18nKey> = {
  intake: I18nKey.NEOME$STATUS_INTAKE,
  discovering: I18nKey.NEOME$STATUS_DISCOVERING,
  interviewing: I18nKey.NEOME$STATUS_INTERVIEWING,
  planned: I18nKey.NEOME$STATUS_PLANNED,
  migrating: I18nKey.NEOME$STATUS_MIGRATING,
  paused: I18nKey.NEOME$STATUS_PAUSED,
  verifying: I18nKey.NEOME$STATUS_VERIFYING,
  done: I18nKey.NEOME$STATUS_DONE,
  failed: I18nKey.NEOME$STATUS_FAILED,
};

export function statusLabelKey(
  status: ModernizationProject["status"],
): I18nKey {
  return STATUS_LABEL_KEY[status];
}

/**
 * The panel beside the Neo ME conversation.
 *
 * Reads like the conversation it mirrors: status on top (live migration
 * box, plan, discovered stack), then every decision -- choice cards and
 * approvals -- in the order the agent asked them, so the newest open question
 * is always at the bottom, scrolled into view. The report closes the story.
 * Nothing here navigates away.
 */
interface WorkbenchHandlers {
  postResult: PostResultFn;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  busy: boolean;
}

type Decision =
  | { kind: "question"; at: string; question: ChoiceQuestion }
  | { kind: "approval"; at: string; approval: ApprovalRequest };

/** Questions and approvals, oldest first, open ones after anything older. */
export function decisionTimeline(project: ModernizationProject): Decision[] {
  const items: Decision[] = [
    ...project.questions.map((question) => ({
      kind: "question" as const,
      at: question.at,
      question,
    })),
    ...project.approvals.map((approval) => ({
      kind: "approval" as const,
      at: approval.at,
      approval,
    })),
  ];
  const isOpen = (d: Decision) =>
    d.kind === "question"
      ? d.question.status === "open"
      : d.approval.status === "pending";
  // Stable: chronological, but anything still waiting on the user sinks to
  // the end so the thing to act on is always last.
  return items
    .map((d, i) => ({ d, i }))
    .sort((a, b) => {
      const open = Number(isOpen(a.d)) - Number(isOpen(b.d));
      if (open !== 0) return open;
      const t = Date.parse(a.d.at) - Date.parse(b.d.at);
      return Number.isNaN(t) || t === 0 ? a.i - b.i : t;
    })
    .map(({ d }) => d);
}

function decisionKey(d: Decision): string {
  return d.kind === "question"
    ? `question-${d.question.id}`
    : `approval-${d.approval.id}`;
}

/** Key of the last card waiting on the user, if any. */
export function latestOpenDecisionKey(
  project: ModernizationProject,
): string | null {
  const open = decisionTimeline(project).filter((d) =>
    d.kind === "question"
      ? d.question.status === "open"
      : d.approval.status === "pending",
  );
  return open.length ? decisionKey(open[open.length - 1]) : null;
}

function buildWorkbenchCards(
  project: ModernizationProject,
  { postResult, onStart, onPause, onResume, busy }: WorkbenchHandlers,
): { key: string; node: React.ReactNode }[] {
  return [
    { key: "live", node: <LiveMigrationCard project={project} /> },
    {
      key: "plan",
      node: (
        <PlanCard
          project={project}
          onStart={onStart}
          onPause={onPause}
          onResume={onResume}
          busy={busy}
        />
      ),
    },
    { key: "stack", node: <StackCard components={project.components} /> },
    ...decisionTimeline(project).map((d) => ({
      key: decisionKey(d),
      node:
        d.kind === "question" ? (
          <ChoiceCard
            projectId={project.id}
            question={d.question}
            postResult={postResult}
          />
        ) : (
          <ApprovalCard
            projectId={project.id}
            approval={d.approval}
            postResult={postResult}
          />
        ),
    })),
    ...(project.report
      ? [{ key: "report", node: <ReportCard report={project.report} /> }]
      : []),
  ];
}

export function ModernizationWorkbench({
  projectId,
  postResult,
  onStart,
  onPause,
  onResume,
  busy,
}: {
  projectId: string;
  postResult: PostResultFn;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation("openhands");
  const reduceMotion = useReducedMotion();
  const project = useModernizationStudioStore((s) => s.projects[projectId]);
  const thinking = useNeoMeThinking();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const latestOpen = project ? latestOpenDecisionKey(project) : null;

  // A new question (or approval) lands at the bottom: bring it into view.
  React.useEffect(() => {
    if (!latestOpen) return undefined;
    const t = setTimeout(() => {
      const el = scrollRef.current?.querySelector(
        `[data-card-key="${latestOpen}"]`,
      );
      el?.scrollIntoView?.({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "end",
      });
    }, 220);
    return () => clearTimeout(t);
  }, [latestOpen, reduceMotion]);

  if (!project) return null;

  const cards = buildWorkbenchCards(project, {
    postResult,
    onStart,
    onPause,
    onResume,
    busy,
  });
  return (
    <div data-testid="neome-workbench" className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border-color)] px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <span
            className="ame-eyebrow flex items-center gap-1.5"
            data-thinking={thinking}
          >
            <NeoOrb size={14} />
            {t(I18nKey.NEOME$WORKBENCH_TITLE)}
          </span>
          <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
            {project.name}
          </span>
        </div>
        <span
          data-testid="neome-status"
          data-status={project.status}
          className="ame-badge ame-badge-neutral shrink-0"
        >
          {t(STATUS_LABEL_KEY[project.status])}
        </span>
      </header>
      {thinking ? (
        <div className="neome-header-bar" data-testid="neome-header-bar" />
      ) : null}
      <div
        ref={scrollRef}
        data-testid="neome-workbench-scroll"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
      >
        <AnimatePresence initial={false}>
          {cards.map((card) => (
            <motion.div
              key={card.key}
              data-card-key={card.key}
              layout={!reduceMotion}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              {card.node}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
