import React from "react";
import { useTranslation } from "react-i18next";
import { Activity, ChevronDown, ChevronUp } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import {
  planProgress,
  type LogEntry,
  type ModernizationProject,
} from "#/stores/modernization-studio-store";
import { useEventStore } from "#/stores/use-event-store";
import { isActionEvent } from "#/types/agent-server/type-guards";
import { useLiveConversationMetrics } from "#/hooks/use-live-conversation-metrics";
import { PHASE_LABEL_KEY } from "./cards";
import { NeoOrb, ThinkingPhrase, useNeoMeThinking } from "./thinking";

/**
 * The big live box: what the agent is doing right now, how far the plan is,
 * and the numbers (files, tests, endpoints, cost, tokens). Reads the studio
 * store (agent `log` / `update_progress`) and the conversation's own tool
 * events, so the user sees commands and edits stream by like a build log.
 */

interface LiveLine {
  id: string;
  level: LogEntry["level"];
  text: string;
  at: string;
}

const MAX_EVENT_LINES = 60;

/** One-line summary of a tool call for the live log. */
function describeAction(
  toolName: string | undefined,
  action: Record<string, unknown>,
): string | null {
  const a = action as { command?: unknown; path?: unknown; kind?: unknown };
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
    case "browser_tool_set":
    case "browser":
      return "browser action";
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

function ProgressRing({ ratio }: { ratio: number }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const pct = Math.round(ratio * 100);
  return (
    <svg
      width="52"
      height="52"
      viewBox="0 0 52 52"
      role="img"
      aria-label={`${pct}%`}
      data-testid="neome-progress-ring"
      data-percent={pct}
    >
      {/* Dashed halo that spins while the agent is thinking. */}
      <circle
        className="neome-ring-halo"
        cx="26"
        cy="26"
        r={r + 4}
        fill="none"
        stroke="var(--primary-500)"
        strokeOpacity="0.5"
        strokeWidth="1.5"
        strokeDasharray="3 6"
      />
      <circle
        cx="26"
        cy="26"
        r={r}
        fill="none"
        stroke="var(--border-color)"
        strokeWidth="5"
      />
      <circle
        cx="26"
        cy="26"
        r={r}
        fill="none"
        stroke="var(--primary-500)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - ratio)}
        transform="rotate(-90 26 26)"
        style={{ transition: "stroke-dashoffset 400ms ease" }}
      />
      <text
        x="26"
        y="30"
        textAnchor="middle"
        fontSize="11"
        fontWeight="600"
        fill="var(--text-primary)"
      >
        {pct}%
      </text>
    </svg>
  );
}

/** HH:MM:SS in the viewer's local time, whatever the timestamp's zone. */
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

export function LiveMigrationCard({
  project,
}: {
  project: ModernizationProject;
}) {
  const { t } = useTranslation("openhands");
  const [expanded, setExpanded] = React.useState(true);
  const metrics = useLiveConversationMetrics(true);
  const eventLines = useEventLines();
  const logRef = React.useRef<HTMLOListElement>(null);

  const progress = planProgress(project.plan);
  const current =
    project.plan.find((s) => s.id === project.currentStepId) ?? null;
  const { stats } = project;

  const lines = React.useMemo<LiveLine[]>(() => {
    const merged: LiveLine[] = [
      ...project.log.map((l) => ({
        id: l.id,
        level: l.level,
        text: l.text,
        at: l.at,
      })),
      ...eventLines,
    ];
    // Agent-server event timestamps are naive local time while the store
    // writes ISO UTC; compare by parsed Date so the stream stays in order.
    merged.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    return merged.slice(-200);
  }, [project.log, eventLines]);

  React.useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  const live =
    project.status === "migrating" ||
    project.status === "verifying" ||
    project.status === "discovering";
  const thinking = useNeoMeThinking();

  const fmtRatio = (done?: number, total?: number) =>
    total === undefined ? "—" : `${done ?? 0}/${total}`;
  const cost = metrics.cost != null ? `$${metrics.cost.toFixed(2)}` : "—";
  const tokens =
    metrics.usage?.prompt_tokens != null
      ? `${Math.round(((metrics.usage.prompt_tokens ?? 0) + (metrics.usage.completion_tokens ?? 0)) / 1000)}k`
      : "—";

  return (
    <section
      data-testid="neome-live"
      data-live={live}
      data-thinking={thinking}
      className="ame-card neome-live flex flex-col gap-3 p-4"
    >
      <div className="flex items-center gap-3">
        <ProgressRing ratio={progress.ratio} />
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
            {t(I18nKey.NEOME$LIVE_TITLE)}
          </span>
          {thinking ? <ThinkingPhrase phase={current?.phase ?? null} /> : null}
          <span
            className={cn(
              "truncate text-[var(--text-primary)]",
              thinking
                ? "text-xs text-[var(--text-secondary)]"
                : "text-sm font-medium",
            )}
          >
            {current
              ? `${t(PHASE_LABEL_KEY[current.phase])} · ${current.title}`
              : t(I18nKey.NEOME$LIVE_IDLE)}
          </span>
          <span className="text-xs text-[var(--text-tertiary)]">
            {t(I18nKey.NEOME$STAT_STEPS)} {progress.done}/{progress.total}
            {project.checkpoints.length
              ? ` · ${t(I18nKey.NEOME$CHECKPOINT_LAST)}: ${project.checkpoints[project.checkpoints.length - 1].label}`
              : ""}
          </span>
        </div>
        <button
          type="button"
          aria-expanded={expanded}
          data-testid="neome-live-toggle"
          onClick={() => setExpanded((v) => !v)}
          className="ame-btn-icon ame-btn-icon-sm"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          testId="neome-stat-files"
          label={t(I18nKey.NEOME$STAT_FILES)}
          value={fmtRatio(stats.filesDone, stats.filesTotal)}
        />
        <Stat
          testId="neome-stat-tests"
          label={t(I18nKey.NEOME$STAT_TESTS)}
          value={fmtRatio(stats.testsPassing, stats.testsTotal)}
        />
        <Stat
          testId="neome-stat-parity"
          label={t(I18nKey.NEOME$STAT_PARITY)}
          value={fmtRatio(stats.parityPassing, stats.parityTotal)}
        />
        <Stat
          testId="neome-stat-endpoints"
          label={t(I18nKey.NEOME$STAT_ENDPOINTS)}
          value={fmtRatio(stats.endpointsDone, stats.endpointsTotal)}
        />
        <Stat
          testId="neome-stat-cost"
          label={t(I18nKey.NEOME$STAT_COST)}
          value={cost}
        />
        <Stat
          testId="neome-stat-tokens"
          label={t(I18nKey.NEOME$STAT_TOKENS)}
          value={tokens}
        />
        {Object.entries(stats.extra ?? {}).map(([k, v]) => (
          <Stat key={k} testId={`neome-stat-${k}`} label={k} value={v} />
        ))}
      </div>

      {expanded ? (
        <ol
          ref={logRef}
          data-testid="neome-live-log"
          className="max-h-72 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-workspace,transparent)] p-3 font-mono text-xs leading-5"
        >
          {lines.length === 0 ? (
            <li className="text-[var(--text-tertiary)]">
              {t(I18nKey.NEOME$LIVE_IDLE)}
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
            <li aria-hidden data-testid="neome-live-caret">
              <span className="neome-caret" />
            </li>
          ) : null}
        </ol>
      ) : null}
    </section>
  );
}
