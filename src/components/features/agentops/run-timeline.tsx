import { useMemo, useState } from "react";
import { Braces, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type {
  AgentOpsRun,
  AgentOpsRunPhase,
  AgentOpsSpan,
} from "#/api/agentops-service/agentops-service.types";
import {
  RUN_PHASES,
  RUN_PHASE_LABEL_KEYS,
  formatTimestamp,
} from "./agentops-formatting";

/**
 * Run replay: a phase-laned waterfall of the run's spans, with an attribute
 * inspector for the selected one.
 *
 * The layout follows the shape of AgentOps' own session replay — phase lanes,
 * time-positioned bars, a per-span attribute panel — but none of its code:
 * the AgentOps dashboard is Elastic-License-2.0 (see `vendor/agentops/README.md`).
 * The span *vocabulary* on the right-hand panel is the MIT semconv we vendored,
 * which is why the attribute keys read `gen_ai.usage.prompt_tokens` and
 * `tool.parameters` rather than something NeoDevEx invented.
 */

const SPAN_KIND_COLORS: Record<string, string> = {
  tool: "var(--primary-500)",
  llm: "var(--accent-500, var(--primary-300))",
  agent: "var(--success-500)",
};

function spanColor(kind: string): string {
  return SPAN_KIND_COLORS[kind] ?? "var(--text-tertiary)";
}

function spanDurationMs(span: AgentOpsSpan): number {
  const start = new Date(span.startTime).getTime();
  const end = span.endTime ? new Date(span.endTime).getTime() : start;
  return Math.max(0, end - start);
}

function renderAttributeValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value, null, 2);
}

interface RunTimelineProps {
  run: AgentOpsRun;
  spans: AgentOpsSpan[];
}

export function RunTimeline({ run, spans }: RunTimelineProps) {
  const { t } = useTranslation("openhands");
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);

  const { windowStart, windowMs, byPhase } = useMemo(() => {
    const times = spans.flatMap((span) => [
      new Date(span.startTime).getTime(),
      span.endTime
        ? new Date(span.endTime).getTime()
        : new Date(span.startTime).getTime(),
    ]);
    const start = times.length
      ? Math.min(...times)
      : new Date(run.startedAt).getTime();
    const end = times.length
      ? Math.max(...times)
      : new Date(run.endedAt ?? run.startedAt).getTime();
    // A run whose spans all share one timestamp would divide by zero; a 1ms
    // floor renders them as equal-width ticks instead.
    const span = Math.max(1, end - start);

    const grouped = new Map<AgentOpsRunPhase, AgentOpsSpan[]>();
    for (const item of spans) {
      const list = grouped.get(item.phase) ?? [];
      list.push(item);
      grouped.set(item.phase, list);
    }

    return { windowStart: start, windowMs: span, byPhase: grouped };
  }, [spans, run.startedAt, run.endedAt]);

  const selectedSpan =
    spans.find((span) => span.spanId === selectedSpanId) ?? null;

  const activePhases = RUN_PHASES.filter((phase) => byPhase.has(phase));

  if (!spans.length) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-color)] p-8 text-center text-sm text-[var(--text-secondary)]">
        {t(I18nKey.AGENTOPS$EMPTY_NO_SPANS)}
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div
        data-testid="agentops-run-timeline"
        className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--background-primary)]"
      >
        {activePhases.map((phase) => (
          <div
            key={phase}
            className="border-b border-[var(--border-color)] px-4 py-3 last:border-b-0"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
                {t(RUN_PHASE_LABEL_KEYS[phase])}
              </span>
              <span className="text-xs text-[var(--text-tertiary)]">
                {t(I18nKey.AGENTOPS$SPAN_COUNT, {
                  count: byPhase.get(phase)?.length ?? 0,
                })}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {(byPhase.get(phase) ?? []).map((span) => {
                const offsetPct =
                  ((new Date(span.startTime).getTime() - windowStart) /
                    windowMs) *
                  100;
                // Sub-percent bars are invisible; floor the width so a fast
                // tool call is still clickable.
                const widthPct = Math.max(
                  1.5,
                  (spanDurationMs(span) / windowMs) * 100,
                );
                const color = spanColor(span.kind);
                const isSelected = span.spanId === selectedSpanId;

                return (
                  <button
                    type="button"
                    key={span.spanId}
                    data-testid={`agentops-span-${span.spanId}`}
                    onClick={() => setSelectedSpanId(span.spanId)}
                    className="group flex items-center gap-2 rounded-[var(--radius-sm)] px-1 py-1 text-left hover:bg-[var(--background-secondary)]"
                  >
                    <span className="flex w-40 shrink-0 items-center gap-1.5 truncate text-xs text-[var(--text-primary)]">
                      {span.kind === "llm" ? (
                        <Braces size={12} className="shrink-0" />
                      ) : (
                        <Wrench size={12} className="shrink-0" />
                      )}
                      <span className="truncate">{span.name}</span>
                    </span>
                    <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-[var(--background-tertiary)]">
                      <span
                        className="absolute top-0 h-full rounded-full"
                        style={{
                          left: `${Math.min(98.5, Math.max(0, offsetPct))}%`,
                          width: `${Math.min(100, widthPct)}%`,
                          backgroundColor: color,
                          opacity: isSelected ? 1 : 0.75,
                        }}
                      />
                    </span>
                    <span className="w-16 shrink-0 text-right font-mono text-[11px] text-[var(--text-tertiary)]">
                      {`${spanDurationMs(span)}ms`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <aside className="rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--background-primary)] p-4">
        {selectedSpan ? (
          <div className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {selectedSpan.name}
              </h3>
              <p className="text-xs text-[var(--text-tertiary)]">
                {selectedSpan.kind} · {selectedSpan.status} ·{" "}
                {formatTimestamp(selectedSpan.startTime)}
              </p>
            </div>
            <dl className="flex flex-col gap-2">
              {Object.entries(selectedSpan.attributes)
                .filter(([, value]) => value !== null && value !== undefined)
                .map(([key, value]) => (
                  <div key={key} className="flex flex-col gap-0.5">
                    <dt className="font-mono text-[11px] text-[var(--text-tertiary)]">
                      {key}
                    </dt>
                    <dd className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-sm)] bg-[var(--background-secondary)] px-2 py-1 font-mono text-[11px] text-[var(--text-primary)]">
                      {renderAttributeValue(value)}
                    </dd>
                  </div>
                ))}
            </dl>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">
            {t(I18nKey.AGENTOPS$SPAN_SELECT_HINT)}
          </p>
        )}
      </aside>
    </div>
  );
}
