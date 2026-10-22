import React from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import {
  useSynthStudioStore,
  type ChoiceQuestion,
  type LogEntry,
  type SynthProject,
  type SynthReport,
} from "#/stores/synth-studio-store";
import { receipt, type PostResultFn } from "#/services/synth-control";
import { relationsOf } from "#/lib/synth/model";
import { privacyReport } from "#/lib/synth/privacy";
import { useEventStore } from "#/stores/use-event-store";
import { isActionEvent } from "#/types/agent-server/type-guards";
import { useLiveConversationMetrics } from "#/hooks/use-live-conversation-metrics";
import { NeoOrb, ThinkingPhrase, useSynthThinking } from "./thinking";

/* ── Live card ─────────────────────────────────────────────────────────── */

interface LiveLine {
  id: string;
  level: LogEntry["level"];
  text: string;
  at: string;
}

const MAX_EVENT_LINES = 60;

function describeAction(
  toolName: string | undefined,
  action: Record<string, unknown>,
): string | null {
  const a = action as { command?: unknown; path?: unknown };
  switch (toolName) {
    case "terminal":
    case "execute_bash":
    case "bash":
      return typeof a.command === "string"
        ? `$ ${a.command.slice(0, 160)}`
        : null;
    case "file_editor":
    case "str_replace_editor":
      return typeof a.path === "string"
        ? `${typeof a.command === "string" ? a.command : "edit"} ${a.path}`
        : null;
    case "synth_control":
      return typeof a.command === "string" ? `synth ${a.command}` : null;
    default:
      return toolName && toolName !== "finish" && toolName !== "think"
        ? toolName.replace(/_/g, " ")
        : null;
  }
}

function useEventLines(): LiveLine[] {
  const events = useEventStore((s) => s.events);
  return React.useMemo(() => {
    const lines: LiveLine[] = [];
    for (
      let i = events.length - 1;
      i >= 0 && lines.length < MAX_EVENT_LINES;
      i--
    ) {
      const event = events[i];
      if (!isActionEvent(event)) continue;
      const text = describeAction(
        event.tool_name,
        event.action as unknown as Record<string, unknown>,
      );
      if (!text) continue;
      lines.push({
        id: `ev-${event.id}`,
        level: "info",
        text,
        at: event.timestamp,
      });
    }
    return lines.reverse();
  }, [events]);
}

function Stat({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex min-w-0 flex-col rounded-[var(--radius-sm)] border border-[var(--border-color)] px-3 py-2"
    >
      <span className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)]">
        {label}
      </span>
      <span className="truncate text-base font-semibold text-[var(--text-primary)]">
        {value}
      </span>
    </div>
  );
}

function formatClock(at: string): string {
  const d = new Date(at);
  return Number.isNaN(d.getTime())
    ? at.slice(11, 19)
    : d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
}

const LEVEL_CLASS: Record<LogEntry["level"], string> = {
  info: "text-[var(--text-secondary)]",
  warn: "text-[var(--warning-600,#b45309)]",
  error: "text-[var(--danger-500,#dc2626)]",
  success: "text-[var(--success-600,#15803d)]",
};

export function LiveCard({ project }: { project: SynthProject }) {
  const { t } = useTranslation("openhands");
  const [expanded, setExpanded] = React.useState(true);
  const metrics = useLiveConversationMetrics(true);
  const eventLines = useEventLines();
  const logRef = React.useRef<HTMLOListElement>(null);
  const thinking = useSynthThinking();

  const lines = React.useMemo<LiveLine[]>(() => {
    const merged: LiveLine[] = [...project.log, ...eventLines];
    merged.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    return merged.slice(-200);
  }, [project.log, eventLines]);

  React.useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  const relations = relationsOf(project.model).length;
  const rows = project.runs.reduce((sum, r) => sum + r.rowsTotal, 0);
  const cost = metrics.cost != null ? `$${metrics.cost.toFixed(2)}` : "—";
  const live =
    project.status === "discovering" ||
    project.status === "modeling" ||
    project.status === "generating" ||
    project.status === "verifying";

  return (
    <section
      data-testid="synth-live"
      data-live={live}
      data-thinking={thinking}
      className="ame-card neome-live flex flex-col gap-3 p-4"
    >
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="ame-eyebrow flex items-center gap-1.5">
            {thinking ? (
              <NeoOrb size={16} />
            ) : (
              <Activity
                size={12}
                aria-hidden
                className={cn(live && "text-[var(--primary-500)]")}
              />
            )}
            {t(I18nKey.SYNTH$LIVE_TITLE)}
          </span>
          {thinking ? (
            <ThinkingPhrase status={project.status} />
          ) : (
            <span className="truncate text-sm font-medium text-[var(--text-primary)]">
              {project.log.length
                ? project.log[project.log.length - 1].text
                : t(I18nKey.SYNTH$LIVE_IDLE)}
            </span>
          )}
        </div>
        <button
          type="button"
          aria-expanded={expanded}
          data-testid="synth-live-toggle"
          onClick={() => setExpanded((v) => !v)}
          className="ame-btn-icon ame-btn-icon-sm"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Stat
          testId="synth-stat-entities"
          label={t(I18nKey.SYNTH$STAT_ENTITIES)}
          value={String(project.model.entities.length)}
        />
        <Stat
          testId="synth-stat-relations"
          label={t(I18nKey.SYNTH$STAT_RELATIONS)}
          value={String(relations)}
        />
        <Stat
          testId="synth-stat-rules"
          label={t(I18nKey.SYNTH$STAT_RULES)}
          value={String(project.model.rules.length)}
        />
        <Stat
          testId="synth-stat-rows"
          label={t(I18nKey.SYNTH$STAT_ROWS)}
          value={rows.toLocaleString()}
        />
        <Stat
          testId="synth-stat-cost"
          label={t(I18nKey.SYNTH$STAT_COST)}
          value={cost}
        />
      </div>

      {expanded ? (
        <ol
          ref={logRef}
          data-testid="synth-live-log"
          className="max-h-60 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-workspace,transparent)] p-3 font-mono text-xs leading-5"
        >
          {lines.length === 0 ? (
            <li className="text-[var(--text-tertiary)]">
              {t(I18nKey.SYNTH$LIVE_IDLE)}
            </li>
          ) : (
            lines.map((line) => (
              <li
                key={line.id}
                className={cn(
                  "whitespace-pre-wrap break-words",
                  LEVEL_CLASS[line.level],
                )}
              >
                <span className="mr-2 text-[var(--text-tertiary)]">
                  {formatClock(line.at)}
                </span>
                {line.text}
              </li>
            ))
          )}
          {thinking ? (
            <li aria-hidden data-testid="synth-live-caret">
              <span className="neome-caret" />
            </li>
          ) : null}
        </ol>
      ) : null}
    </section>
  );
}

/* ── Choice card ───────────────────────────────────────────────────────── */

export function ChoiceCard({
  projectId,
  question,
  postResult,
}: {
  projectId: string;
  question: ChoiceQuestion;
  postResult: PostResultFn;
}) {
  const { t } = useTranslation("openhands");
  const answerQuestion = useSynthStudioStore((s) => s.answerQuestion);
  const [selected, setSelected] = React.useState<string[]>(question.selected);
  const [other, setOther] = React.useState(question.other ?? "");
  const answered = question.status === "answered";
  const OTHER = "__other__";

  const toggle = (id: string) => {
    if (answered) return;
    if (question.kind === "single") {
      setSelected([id]);
      return;
    }
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const confirm = () => {
    const picked = selected.filter((id) => id !== OTHER);
    const otherText = selected.includes(OTHER) ? other.trim() : undefined;
    if (picked.length === 0 && !otherText) return;
    const saved = answerQuestion(projectId, question.id, picked, otherText);
    if (!saved) return;
    postResult(
      receipt({
        status: "answered",
        question_id: question.id,
        selected: picked,
        selected_labels: picked.map(
          (id) => question.options.find((o) => o.id === id)?.label ?? id,
        ),
        other: otherText,
      }),
    );
  };

  const canConfirm =
    selected.some((id) => id !== OTHER) ||
    (selected.includes(OTHER) && other.trim().length > 0);

  return (
    <section
      data-testid={`synth-question-${question.id}`}
      data-status={question.status}
      className={cn(
        "ame-card flex flex-col gap-3 p-4",
        !answered && "ring-1 ring-[var(--primary-500)]/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="ame-eyebrow">{t(I18nKey.SYNTH$QUESTION_TITLE)}</span>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            {question.title}
          </h3>
          {question.prompt ? (
            <p className="text-sm text-[var(--text-secondary)]">
              {question.prompt}
            </p>
          ) : null}
        </div>
        {answered ? (
          <span className="ame-badge ame-badge-success shrink-0">
            <Check size={12} aria-hidden /> {t(I18nKey.SYNTH$ANSWERED)}
          </span>
        ) : null}
      </div>
      <div
        role={question.kind === "single" ? "radiogroup" : "group"}
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
      >
        {question.options.map((option) => {
          const active = selected.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              role={question.kind === "single" ? "radio" : "checkbox"}
              aria-checked={active}
              disabled={answered}
              data-testid={`synth-option-${question.id}-${option.id}`}
              onClick={() => toggle(option.id)}
              className={cn(
                "flex items-center gap-3 rounded-[var(--radius-sm)] border p-3 text-left transition-colors",
                active
                  ? "border-[var(--primary-500)] bg-[var(--primary-bg-subtle)]"
                  : "border-[var(--border-color)]",
                answered && !active && "opacity-50",
              )}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                  {option.label}
                  {option.recommended ? (
                    <span className="ame-badge ame-badge-primary">
                      {t(I18nKey.SYNTH$RECOMMENDED)}
                    </span>
                  ) : null}
                </span>
                {option.description ? (
                  <span className="text-xs text-[var(--text-tertiary)]">
                    {option.description}
                  </span>
                ) : null}
              </span>
              <span
                aria-hidden
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                  active
                    ? "border-[var(--primary-500)] bg-[var(--primary-500)] text-white"
                    : "border-[var(--border-color)]",
                )}
              >
                {active ? <Check size={12} /> : null}
              </span>
            </button>
          );
        })}
        {question.allowOther ? (
          <div
            className={cn(
              "flex flex-col gap-2 rounded-[var(--radius-sm)] border p-3",
              selected.includes(OTHER)
                ? "border-[var(--primary-500)]"
                : "border-[var(--border-color)]",
            )}
          >
            <button
              type="button"
              disabled={answered}
              data-testid={`synth-option-${question.id}-other`}
              onClick={() => toggle(OTHER)}
              className="text-left text-sm font-medium text-[var(--text-primary)]"
            >
              {t(I18nKey.SYNTH$OTHER)}
            </button>
            {selected.includes(OTHER) ? (
              <input
                type="text"
                value={other}
                disabled={answered}
                onChange={(e) => setOther(e.target.value)}
                placeholder={t(I18nKey.SYNTH$OTHER_PLACEHOLDER)}
                data-testid={`synth-other-${question.id}`}
                className="ame-input w-full rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-transparent px-2 py-1 text-sm"
              />
            ) : null}
          </div>
        ) : null}
      </div>
      {!answered ? (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!canConfirm}
            data-testid={`synth-confirm-${question.id}`}
            onClick={confirm}
            className="ame-btn-primary ame-btn-sm"
          >
            {t(I18nKey.SYNTH$CONFIRM)}
          </button>
        </div>
      ) : null}
    </section>
  );
}

/* ── Privacy card ──────────────────────────────────────────────────────── */

export function PrivacyCard({ project }: { project: SynthProject }) {
  const { t } = useTranslation("openhands");
  const report = React.useMemo(
    () => privacyReport(project.model),
    [project.model],
  );
  if (project.model.entities.length === 0) return null;
  return (
    <section
      data-testid="synth-privacy"
      className="ame-card flex flex-col gap-2 p-4"
    >
      <span className="ame-eyebrow flex items-center gap-1">
        <ShieldCheck size={12} aria-hidden /> {t(I18nKey.SYNTH$PRIVACY_TITLE)}
      </span>
      <p className="text-sm text-[var(--text-secondary)]">
        {t(I18nKey.SYNTH$PRIVACY_BODY)}
      </p>
      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className="ame-badge ame-badge-danger">
          {t(I18nKey.SYNTH$PII_DIRECT, { count: report.counts.direct })}
        </span>
        <span className="ame-badge ame-badge-warning">
          {t(I18nKey.SYNTH$PII_QUASI, { count: report.counts.quasi })}
        </span>
        <span className="ame-badge ame-badge-primary">
          {t(I18nKey.SYNTH$PII_SENSITIVE, { count: report.counts.sensitive })}
        </span>
      </div>
      <p
        data-testid="synth-privacy-treatments"
        className="text-xs text-[var(--text-secondary)]"
      >
        {t(I18nKey.SYNTH$TREATED_FIELDS, {
          synthetic: report.strategies.synthesize,
          pseudonymized: report.strategies.pseudonymize,
          masked: report.strategies.mask,
          generalized: report.strategies.generalize,
          redacted: report.strategies.redact,
        })}
      </p>
      {report.undecided.length ? (
        <p
          data-testid="synth-privacy-undecided"
          className="ame-alert ame-alert-warning text-xs"
        >
          {t(I18nKey.SYNTH$PII_UNDECIDED, {
            count: report.undecided.length,
            fields: report.undecided
              .slice(0, 4)
              .map((u) => `${u.entity}.${u.field}`)
              .join(", "),
          })}
        </p>
      ) : null}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)]">
          {t(I18nKey.SYNTH$SAFE_TITLE)}
        </span>
        <ul
          data-testid="synth-privacy-safe"
          className="grid grid-cols-1 gap-x-3 gap-y-0.5 text-[11px] text-[var(--text-secondary)] sm:grid-cols-2"
        >
          {SAFE_RANGE_KEYS.map((key) => (
            <li key={key} className="flex items-start gap-1">
              <Check
                size={11}
                aria-hidden
                className="mt-0.5 shrink-0 text-[var(--success-500,#16a34a)]"
              />
              {t(key)}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Where each kind of identifier comes from, so none can be a real one. */
const SAFE_RANGE_KEYS: I18nKey[] = [
  I18nKey.SYNTH$SAFE_EMAIL,
  I18nKey.SYNTH$SAFE_PHONE,
  I18nKey.SYNTH$SAFE_SSN,
  I18nKey.SYNTH$SAFE_CARD,
  I18nKey.SYNTH$SAFE_TAX,
  I18nKey.SYNTH$SAFE_IP,
  I18nKey.SYNTH$SAFE_OTHER_IDS,
  I18nKey.SYNTH$SAFE_SPECIAL,
];

/* ── Report card ───────────────────────────────────────────────────────── */

export function ReportCard({ report }: { report: SynthReport }) {
  const { t } = useTranslation("openhands");
  return (
    <section
      data-testid="synth-report"
      className="ame-card flex flex-col gap-2 p-4"
    >
      <span className="ame-eyebrow flex items-center gap-1">
        <FileText size={12} aria-hidden /> {t(I18nKey.SYNTH$REPORT_TITLE)}
      </span>
      <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">
        {report.summary}
      </p>
      {report.artifacts.length ? (
        <ul className="flex flex-wrap gap-1">
          {report.artifacts.map((a) => (
            <li key={a} className="ame-badge ame-badge-neutral font-mono">
              {a}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
