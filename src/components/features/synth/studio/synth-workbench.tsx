import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Maximize2, Minimize2 } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import {
  useSynthStudioStore,
  type SynthProject,
} from "#/stores/synth-studio-store";
import type { GenerateRequest, PostResultFn } from "#/services/synth-control";
import { ChoiceCard, LiveCard, PrivacyCard, ReportCard } from "./cards";
import { ModelCard, RulesCard } from "./model-card";
import { GenerateCard } from "./generate-card";
import { RunsCard } from "./runs-card";
import { MaskCard } from "./mask-card";
import { NeoOrb, useSynthThinking } from "./thinking";

const STATUS_LABEL_KEY: Record<SynthProject["status"], I18nKey> = {
  intake: I18nKey.SYNTH$STATUS_INTAKE,
  discovering: I18nKey.SYNTH$STATUS_DISCOVERING,
  modeling: I18nKey.SYNTH$STATUS_MODELING,
  interviewing: I18nKey.SYNTH$STATUS_INTERVIEWING,
  ready: I18nKey.SYNTH$STATUS_READY,
  generating: I18nKey.SYNTH$STATUS_GENERATING,
  verifying: I18nKey.SYNTH$STATUS_VERIFYING,
  done: I18nKey.SYNTH$STATUS_DONE,
  failed: I18nKey.SYNTH$STATUS_FAILED,
};

export function statusLabelKey(status: SynthProject["status"]): I18nKey {
  return STATUS_LABEL_KEY[status];
}

/** Key of the last open question, if any (it is scrolled into view). */
export function latestOpenQuestionKey(project: SynthProject): string | null {
  const open = project.questions.filter((q) => q.status === "open");
  return open.length ? `question-${open[open.length - 1].id}` : null;
}

/**
 * The panel beside the Neo Synth conversation. Top to bottom: what is
 * happening (live), the data model, rules, open questions, the generate
 * controls, the runs, privacy, the report. Open questions sink to just
 * above the generate controls so the thing to act on is never buried.
 */
export function SynthWorkbench({
  projectId,
  postResult,
  onGenerate,
  busy,
  expanded = false,
  onToggleExpand,
}: {
  projectId: string;
  postResult: PostResultFn;
  onGenerate: (request: GenerateRequest) => void;
  busy: boolean;
  /** The studio fills the screen (chat hidden). */
  expanded?: boolean;
  /** Present when the layout can expand (desktop). */
  onToggleExpand?: () => void;
}) {
  const { t } = useTranslation("openhands");
  const reduceMotion = useReducedMotion();
  const project = useSynthStudioStore((s) => s.projects[projectId]);
  const thinking = useSynthThinking();
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

  // A new run landed: bring it into view.
  const runCount = project?.runs.length ?? 0;
  const seenRuns = React.useRef(runCount);
  React.useEffect(() => {
    if (runCount <= seenRuns.current) {
      seenRuns.current = runCount;
      return undefined;
    }
    seenRuns.current = runCount;
    const timer = setTimeout(() => {
      scrollRef.current
        ?.querySelector('[data-card-key="runs"]')
        ?.scrollIntoView?.({
          behavior: reduceMotion ? "auto" : "smooth",
          block: "start",
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [runCount, reduceMotion]);

  if (!project) return null;

  const questions = [...project.questions].sort((a, b) => {
    const open = Number(a.status === "open") - Number(b.status === "open");
    return open !== 0 ? open : Date.parse(a.at) - Date.parse(b.at);
  });

  const cards: { key: string; node: React.ReactNode }[] = [
    { key: "live", node: <LiveCard project={project} /> },
    {
      key: "model",
      node: <ModelCard projectId={project.id} model={project.model} />,
    },
    ...(project.model.rules.length
      ? [
          {
            key: "rules",
            node: <RulesCard projectId={project.id} model={project.model} />,
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
    ...(project.model.entities.length
      ? [
          {
            key: "generate",
            node: (
              <GenerateCard
                project={project}
                onGenerate={onGenerate}
                busy={busy}
              />
            ),
          },
        ]
      : []),
    ...(project.runs.length
      ? [{ key: "runs", node: <RunsCard runs={project.runs} /> }]
      : []),
    { key: "privacy", node: <PrivacyCard project={project} /> },
    ...(project.model.entities.length
      ? [
          {
            key: "mask",
            node: <MaskCard model={project.model} seed={project.id} />,
          },
        ]
      : []),
    ...(project.report
      ? [{ key: "report", node: <ReportCard report={project.report} /> }]
      : []),
  ];

  return (
    <div data-testid="synth-workbench" className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border-color)] px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <span
            className="ame-eyebrow flex items-center gap-1.5"
            data-thinking={thinking}
          >
            <NeoOrb size={14} />
            {t(I18nKey.SYNTH$WORKBENCH_TITLE)}
          </span>
          <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
            {project.name}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            data-testid="synth-status"
            data-status={project.status}
            className="ame-badge ame-badge-neutral"
          >
            {t(STATUS_LABEL_KEY[project.status])}
          </span>
          {onToggleExpand ? (
            <button
              type="button"
              aria-pressed={expanded}
              data-testid="synth-expand-toggle"
              onClick={onToggleExpand}
              className="ame-btn-secondary ame-btn-xs"
            >
              {expanded ? (
                <Minimize2 size={12} aria-hidden />
              ) : (
                <Maximize2 size={12} aria-hidden />
              )}{" "}
              {expanded
                ? t(I18nKey.SYNTH$SHOW_CHAT)
                : t(I18nKey.SYNTH$EXPAND_STUDIO)}
            </button>
          ) : null}
        </div>
      </header>
      {thinking ? (
        <div className="neome-header-bar" data-testid="synth-header-bar" />
      ) : null}
      <div
        ref={scrollRef}
        data-testid="synth-workbench-scroll"
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4",
          // Full width reads better centred than stretched edge to edge.
          expanded && "mx-auto w-full max-w-[1400px]",
        )}
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
