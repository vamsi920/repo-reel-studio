import React from "react";
import { useTranslation } from "react-i18next";
import { TrendingUp } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import type { TestProject, TestRun } from "#/stores/test-studio-store";
import { passRate, round, type GateVerdict } from "#/lib/testing/model";
import { formatMs, formatPct } from "./cards";

/** Inline SVG sparkline; frame-driven, no library. */
function Sparkline({
  values,
  max,
  testId,
}: {
  values: (number | undefined)[];
  max?: number;
  testId: string;
}) {
  const points = values
    .map((v, i) => ({ i, v }))
    .filter((p): p is { i: number; v: number } => p.v !== undefined);
  if (points.length < 2)
    return <span className="text-[11px] text-[var(--text-tertiary)]">—</span>;
  const w = 120;
  const h = 28;
  const top = max ?? Math.max(...points.map((p) => p.v), 1);
  const bottom = max !== undefined ? 0 : Math.min(...points.map((p) => p.v), 0);
  const range = top - bottom || 1;
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * (w - 4) + 2;
  const y = (v: number) => h - 2 - ((v - bottom) / range) * (h - 4);
  const d = points
    .map(
      (p, k) =>
        `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`,
    )
    .join(" ");
  const last = points[points.length - 1];
  return (
    <svg
      data-testid={testId}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden
      className="shrink-0 text-[var(--primary-500)]"
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={x(last.i)} cy={y(last.v)} r={2.2} fill="currentColor" />
    </svg>
  );
}

const VERDICT_DOT: Record<GateVerdict | "none", string> = {
  passed: "bg-[var(--success-600,#15803d)]",
  failed: "bg-[var(--danger-500,#dc2626)]",
  warned: "bg-[var(--warning-600,#b45309)]",
  not_measured: "bg-[var(--border-color)]",
  none: "bg-[var(--border-color)]",
};

function delta(value: number | undefined, unit = ""): string {
  if (value === undefined || value === 0) return "";
  return ` (${value > 0 ? "+" : ""}${round(value, 1)}${unit})`;
}

export function TrendCard({ project }: { project: TestProject }) {
  const { t } = useTranslation("openhands");
  const runs = project.runs.filter(
    (r): r is TestRun & { report: NonNullable<TestRun["report"]> } =>
      Boolean(r.report),
  );
  if (runs.length === 0) return null;
  const latest = runs[runs.length - 1].report;
  const rates = runs.map((r) => passRate(r.report.counts));
  const coverage = runs.map((r) => r.report.coverage?.lines.pct);
  const p95 = runs.map((r) =>
    r.report.perf.length
      ? Math.max(...r.report.perf.map((p) => p.p95Ms ?? 0))
      : undefined,
  );
  const rows = [
    {
      key: "pass",
      label: t(I18nKey.TESTING$STAT_PASS_RATE),
      values: rates,
      max: 100,
      value:
        formatPct(rates[rates.length - 1]) +
        delta(latest.trend?.passRate, " pts"),
    },
    {
      key: "coverage",
      label: t(I18nKey.TESTING$STAT_COVERAGE),
      values: coverage,
      max: 100,
      value:
        formatPct(coverage[coverage.length - 1]) +
        delta(latest.trend?.lineCoverage, " pts"),
    },
    {
      key: "p95",
      label: t(I18nKey.TESTING$STAT_P95),
      values: p95,
      max: undefined,
      value: formatMs(p95[p95.length - 1]) + delta(latest.trend?.p95Ms, " ms"),
    },
  ];
  return (
    <section
      data-testid="testing-trend"
      className="ame-card flex flex-col gap-3 p-4"
    >
      <span className="ame-eyebrow flex items-center gap-1">
        <TrendingUp size={12} aria-hidden />{" "}
        {t(I18nKey.TESTING$TREND_TITLE, { count: runs.length })}
      </span>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-3 text-xs">
            <span className="w-28 shrink-0 text-[var(--text-tertiary)]">
              {row.label}
            </span>
            <Sparkline
              values={row.values}
              max={row.max}
              testId={`testing-sparkline-${row.key}`}
            />
            <span className="text-[var(--text-primary)]">{row.value}</span>
          </li>
        ))}
      </ul>
      <ol
        data-testid="testing-run-history"
        className="flex flex-col gap-0.5 text-[11px] text-[var(--text-secondary)]"
      >
        {[...runs]
          .reverse()
          .slice(0, 8)
          .map((r) => (
            <li key={r.id} className="flex items-center gap-2">
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  VERDICT_DOT[r.report.gates.verdict],
                )}
              />
              <span className="font-mono">
                {r.report.finishedAt.slice(0, 16).replace("T", " ")}
              </span>
              <span className="truncate">
                {r.report.counts.passed}/
                {r.report.counts.total - r.report.counts.skipped}
                {r.report.coverage?.lines.pct !== undefined
                  ? ` · ${formatPct(r.report.coverage.lines.pct)}`
                  : ""}
                {r.triggeredBy !== "agent" ? ` · ${r.triggeredBy}` : ""}
              </span>
            </li>
          ))}
      </ol>
    </section>
  );
}
