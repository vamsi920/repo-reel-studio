import React from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  AlertTriangle,
  Bug,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
} from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import {
  latestReport,
  useTestStudioStore,
  type ChoiceQuestion,
  type Finding,
  type LogEntry,
  type TestProject,
  type TestSummary,
} from "#/stores/test-studio-store";
import { receipt, type PostResultFn } from "#/services/test-control";
import { KIND_LABELS, passRate, round } from "#/lib/testing/model";
import { useEventStore } from "#/stores/use-event-store";
import { isActionEvent } from "#/types/agent-server/type-guards";
import { useLiveConversationMetrics } from "#/hooks/use-live-conversation-metrics";
import { NeoOrb, ThinkingPhrase, useTestThinking } from "./thinking";

/* ── Shared bits ───────────────────────────────────────────────────────── */

export const SEVERITY_BADGE: Record<Finding["severity"], string> = {
  critical: "ame-badge ame-badge-danger",
  high: "ame-badge ame-badge-danger",
  medium: "ame-badge ame-badge-warning",
  low: "ame-badge ame-badge-neutral",
  info: "ame-badge ame-badge-neutral",
};

export function formatPct(value: number | undefined): string {
  return value === undefined ? "—" : `${round(value, 1)}%`;
}

export function formatMs(value: number | undefined): string {
  return value === undefined ? "—" : `${Math.round(value)} ms`;
}

export function Stat({
  label,
  value,
  testId,
  tone,
}: {
  label: string;
  value: string;
  testId: string;
  tone?: "good" | "bad" | "warn";
}) {
  return (
    <div
      data-testid={testId}
      className="flex min-w-0 flex-col rounded-[var(--radius-sm)] border border-[var(--border-color)] px-3 py-2"
    >
      <span className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)]">
        {label}
      </span>
      <span
        className={cn(
          "truncate text-base font-semibold text-[var(--text-primary)]",
          tone === "good" && "text-[var(--success-600,#15803d)]",
          tone === "bad" && "text-[var(--danger-500,#dc2626)]",
          tone === "warn" && "text-[var(--warning-600,#b45309)]",
        )}
      >
        {value}
      </span>
    </div>
  );
}

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
    case "test_control":
      return typeof a.command === "string" ? `neotest ${a.command}` : null;
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
      i -= 1
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

export function LiveCard({ project }: { project: TestProject }) {
  const { t } = useTranslation("openhands");
  const [expanded, setExpanded] = React.useState(true);
  const metrics = useLiveConversationMetrics(true);
  const eventLines = useEventLines();
  const logRef = React.useRef<HTMLOListElement>(null);
  const thinking = useTestThinking();

  const lines = React.useMemo<LiveLine[]>(() => {
    const merged: LiveLine[] = [...project.log, ...eventLines];
    merged.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    return merged.slice(-200);
  }, [project.log, eventLines]);

  React.useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  const report = latestReport(project);
  const applicable = project.plan.filter((s) => !s.notApplicable);
  const rate = report ? passRate(report.counts) : undefined;
  const cost = metrics.cost != null ? `$${metrics.cost.toFixed(2)}` : "—";
  const live =
    project.status === "discovering" ||
    project.status === "running" ||
    project.status === "reporting";

  return (
    <section
      data-testid="testing-live"
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
            {t(I18nKey.TESTING$LIVE_TITLE)}
          </span>
          {thinking ? (
            <ThinkingPhrase status={project.status} />
          ) : (
            <span className="truncate text-sm font-medium text-[var(--text-primary)]">
              {project.log.length
                ? project.log[project.log.length - 1].text
                : t(I18nKey.TESTING$LIVE_IDLE)}
            </span>
          )}
        </div>
        <button
          type="button"
          aria-expanded={expanded}
          data-testid="testing-live-toggle"
          onClick={() => setExpanded((v) => !v)}
          className="ame-btn-icon ame-btn-icon-sm"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Stat
          testId="testing-stat-suites"
          label={t(I18nKey.TESTING$STAT_SUITES)}
          value={String(applicable.length)}
        />
        <Stat
          testId="testing-stat-tests"
          label={t(I18nKey.TESTING$STAT_TESTS)}
          value={report ? String(report.counts.total) : "—"}
        />
        <Stat
          testId="testing-stat-pass-rate"
          label={t(I18nKey.TESTING$STAT_PASS_RATE)}
          value={formatPct(rate)}
          tone={
            rate === undefined
              ? undefined
              : rate === 100
                ? "good"
                : rate < 90
                  ? "bad"
                  : "warn"
          }
        />
        <Stat
          testId="testing-stat-coverage"
          label={t(I18nKey.TESTING$STAT_COVERAGE)}
          value={formatPct(report?.coverage?.lines.pct)}
        />
        <Stat
          testId="testing-stat-cost"
          label={t(I18nKey.TESTING$STAT_COST)}
          value={cost}
        />
      </div>

      {expanded ? (
        <ol
          ref={logRef}
          data-testid="testing-live-log"
          className="max-h-60 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-workspace,transparent)] p-3 font-mono text-xs leading-5"
        >
          {lines.length === 0 ? (
            <li className="text-[var(--text-tertiary)]">
              {t(I18nKey.TESTING$LIVE_IDLE)}
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
            <li aria-hidden data-testid="testing-live-caret">
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
  const answerQuestion = useTestStudioStore((s) => s.answerQuestion);
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
      data-testid={`testing-question-${question.id}`}
      data-status={question.status}
      className={cn(
        "ame-card flex flex-col gap-3 p-4",
        !answered && "ring-1 ring-[var(--primary-500)]/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="ame-eyebrow">
            {t(I18nKey.TESTING$QUESTION_TITLE)}
          </span>
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
            <Check size={12} aria-hidden /> {t(I18nKey.TESTING$ANSWERED)}
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
              data-testid={`testing-option-${question.id}-${option.id}`}
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
                      {t(I18nKey.TESTING$RECOMMENDED)}
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
              data-testid={`testing-option-${question.id}-other`}
              onClick={() => toggle(OTHER)}
              className="text-left text-sm font-medium text-[var(--text-primary)]"
            >
              {t(I18nKey.TESTING$OTHER)}
            </button>
            {selected.includes(OTHER) ? (
              <input
                type="text"
                value={other}
                disabled={answered}
                onChange={(e) => setOther(e.target.value)}
                placeholder={t(I18nKey.TESTING$OTHER_PLACEHOLDER)}
                data-testid={`testing-other-${question.id}`}
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
            data-testid={`testing-confirm-${question.id}`}
            onClick={confirm}
            className="ame-btn-primary ame-btn-sm"
          >
            {t(I18nKey.TESTING$CONFIRM)}
          </button>
        </div>
      ) : null}
    </section>
  );
}

/* ── Findings card ─────────────────────────────────────────────────────── */

const SEVERITY_ORDER: Finding["severity"][] = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
];

export function FindingsCard({ project }: { project: TestProject }) {
  const { t } = useTranslation("openhands");
  const setFindingStatus = useTestStudioStore((s) => s.setFindingStatus);
  const findings = [...project.findings].sort((a, b) => {
    const open = Number(b.status === "open") - Number(a.status === "open");
    return open !== 0
      ? open
      : SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
  });
  const open = findings.filter((f) => f.status === "open").length;
  return (
    <section
      data-testid="testing-findings"
      className="ame-card flex flex-col gap-3 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="ame-eyebrow flex items-center gap-1">
          <Bug size={12} aria-hidden /> {t(I18nKey.TESTING$FINDINGS_TITLE)}
        </span>
        <span
          className={cn(
            "ame-badge",
            open ? "ame-badge-danger" : "ame-badge-success",
          )}
        >
          {t(I18nKey.TESTING$FINDINGS_OPEN, { count: open })}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {findings.map((f) => (
          <li
            key={f.id}
            data-testid={`testing-finding-${f.id}`}
            data-status={f.status}
            className={cn(
              "flex flex-col gap-1 rounded-[var(--radius-sm)] border border-[var(--border-color)] p-3",
              f.status !== "open" && "opacity-60",
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className={SEVERITY_BADGE[f.severity]}>{f.severity}</span>
              <span className="ame-badge ame-badge-neutral">
                {KIND_LABELS[f.kind]}
              </span>
              <span className="text-sm font-medium text-[var(--text-primary)]">
                {f.title}
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              {f.description}
            </p>
            {f.file ? (
              <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
                {f.file}
                {f.line ? `:${f.line}` : ""}
              </span>
            ) : null}
            <div className="flex flex-wrap items-center gap-1">
              {f.evidence.slice(0, 4).map((e) => (
                <span key={e} className="ame-badge ame-badge-neutral font-mono">
                  {e}
                </span>
              ))}
              <span className="flex-1" />
              {f.status === "open" ? (
                <>
                  <button
                    type="button"
                    data-testid={`testing-finding-fixed-${f.id}`}
                    onClick={() => setFindingStatus(project.id, f.id, "fixed")}
                    className="ame-btn-secondary ame-btn-xs"
                  >
                    {t(I18nKey.TESTING$FINDING_FIXED)}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setFindingStatus(project.id, f.id, "wontfix")
                    }
                    className="ame-btn-ghost ame-btn-xs"
                  >
                    {t(I18nKey.TESTING$FINDING_WONTFIX)}
                  </button>
                </>
              ) : (
                <span className="text-xs text-[var(--text-tertiary)]">
                  {f.status}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Report card ───────────────────────────────────────────────────────── */

export function ReportCard({ report }: { report: TestSummary }) {
  const { t } = useTranslation("openhands");
  return (
    <section
      data-testid="testing-report"
      className="ame-card flex flex-col gap-2 p-4"
    >
      <span className="ame-eyebrow flex items-center gap-1">
        <FileText size={12} aria-hidden /> {t(I18nKey.TESTING$REPORT_TITLE)}
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

/** A note shown when the project has no runtime-backed results yet. */
export function EmptyNote({ text, testId }: { text: string; testId: string }) {
  return (
    <p
      data-testid={testId}
      className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]"
    >
      <AlertTriangle size={12} aria-hidden /> {text}
    </p>
  );
}
