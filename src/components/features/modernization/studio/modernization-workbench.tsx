import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import {
  useModernizationStudioStore,
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
 * Order is deliberate: whatever needs the user's hand (open questions,
 * approvals) sits on top, then the live migration box, then the plan, the
 * stack map, and finally the report. Nothing here navigates away.
 */
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
  if (!project) return null;

  const openQuestions = project.questions.filter((q) => q.status === "open");
  const answered = project.questions.filter((q) => q.status === "answered");
  const pendingApprovals = project.approvals.filter(
    (a) => a.status === "pending",
  );

  const cards: { key: string; node: React.ReactNode }[] = [
    ...pendingApprovals.map((a) => ({
      key: `approval-${a.id}`,
      node: (
        <ApprovalCard
          projectId={project.id}
          approval={a}
          postResult={postResult}
        />
      ),
    })),
    ...openQuestions.map((q) => ({
      key: `question-${q.id}`,
      node: (
        <ChoiceCard
          projectId={project.id}
          question={q}
          postResult={postResult}
        />
      ),
    })),
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
    ...(project.report
      ? [{ key: "report", node: <ReportCard report={project.report} /> }]
      : []),
    ...answered
      .slice()
      .reverse()
      .map((q) => ({
        key: `question-${q.id}`,
        node: (
          <ChoiceCard
            projectId={project.id}
            question={q}
            postResult={postResult}
          />
        ),
      })),
  ];

  return (
    <div data-testid="neome-workbench" className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border-color)] px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <span className="ame-eyebrow">
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
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <AnimatePresence initial={false}>
          {cards.map((card) => (
            <motion.div
              key={card.key}
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
