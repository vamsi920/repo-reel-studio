import React from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleX,
  Download,
  Gauge,
  TriangleAlert,
} from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import {
  KIND_LABELS,
  passRate,
  round,
  type GateVerdict,
  type SuiteResult,
  type TestCase,
  type TestReport,
} from "#/lib/testing/model";
import { METRIC_LABELS } from "#/lib/testing/gates";
import { reportMarkdown } from "#/lib/testing/report";
import { receipt, type PostResultFn } from "#/services/test-control";
import type { TestRun } from "#/stores/test-studio-store";
import { downloadFile } from "#/components/features/synth/studio/download";
import { SEVERITY_BADGE, Stat, formatMs, formatPct } from "./cards";

const VERDICT_KEY: Record<GateVerdict, I18nKey> = {
  passed: I18nKey.TESTING$VERDICT_PASSED,
  failed: I18nKey.TESTING$VERDICT_FAILED,
  warned: I18nKey.TESTING$VERDICT_WARNED,
  not_measured: I18nKey.TESTING$VERDICT_NOT_MEASURED,
};

const GATE_MARK: Record<GateVerdict, string> = {
  passed: "✓",
  failed: "✗",
  warned: "!",
  not_measured: "–",
};

const VERDICT_CLASS: Record<GateVerdict, string> = {
  passed:
    "border-[var(--success-600,#15803d)] bg-[var(--success-50,rgba(21,128,61,0.08))]",
  failed:
    "border-[var(--danger-500,#dc2626)] bg-[var(--danger-50,rgba(220,38,38,0.08))]",
  warned:
    "border-[var(--warning-600,#b45309)] bg-[var(--warning-50,rgba(180,83,9,0.08))]",
  not_measured: "border-[var(--border-color)]",
};

export function VerdictBanner({ report }: { report: TestReport }) {
  const { t } = useTranslation("openhands");
  const { verdict } = report.gates;
  const Icon =
    verdict === "passed"
      ? CircleCheck
      : verdict === "failed"
        ? CircleX
        : TriangleAlert;
  const failed = report.gates.results.filter((r) => r.verdict === "failed");
  const warned = report.gates.results.filter((r) => r.verdict === "warned");
  return (
    <div
      data-testid="testing-verdict"
      data-verdict={verdict}
      className={cn(
        "flex flex-col gap-1 rounded-[var(--radius-sm)] border p-3",
        VERDICT_CLASS[verdict],
      )}
    >
      <div className="flex items-center gap-2">
        <Icon size={18} aria-hidden />
        <span className="text-base font-semibold text-[var(--text-primary)]">
          {t(VERDICT_KEY[verdict])}
        </span>
        <span className="ml-auto font-mono text-[11px] text-[var(--text-tertiary)]">
          {report.runId}
          {report.commit ? ` · ${report.commit.slice(0, 8)}` : ""}
        </span>
      </div>
      {failed.length || warned.length ? (
        <ul className="flex flex-col gap-0.5 text-xs text-[var(--text-secondary)]">
          {[...failed, ...warned].map((r) => (
            <li key={r.rule.id}>
              <span aria-hidden>{GATE_MARK[r.verdict]}</span>{" "}
              {METRIC_LABELS[r.rule.metric]}: {r.actual} ({r.rule.op}{" "}
              {r.rule.threshold})
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CoverageBar({
  pct,
  label,
}: {
  pct: number | undefined;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between text-[11px] text-[var(--text-tertiary)]">
        <span>{label}</span>
        <span>{formatPct(pct)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-[var(--border-color)]">
        <div
          className={cn(
            "h-full rounded",
            pct === undefined
              ? ""
              : pct >= 80
                ? "bg-[var(--success-600,#15803d)]"
                : pct >= 60
                  ? "bg-[var(--warning-600,#b45309)]"
                  : "bg-[var(--danger-500,#dc2626)]",
          )}
          style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }}
        />
      </div>
    </div>
  );
}

function CaseRow({ c }: { c: TestCase }) {
  const [open, setOpen] = React.useState(false);
  return (
    <li className="flex flex-col gap-0.5 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-start gap-1 text-left text-[var(--text-primary)]"
      >
        {c.details || c.message ? (
          open ? (
            <ChevronDown size={12} className="mt-0.5 shrink-0" />
          ) : (
            <ChevronRight size={12} className="mt-0.5 shrink-0" />
          )
        ) : (
          <span className="w-3" />
        )}
        <span
          className={cn(
            "ame-badge",
            c.status === "flaky" ? "ame-badge-warning" : "ame-badge-danger",
          )}
        >
          {c.status}
        </span>
        <span className="min-w-0 flex-1 break-words">{c.name}</span>
      </button>
      {c.file ? (
        <span className="pl-4 font-mono text-[11px] text-[var(--text-tertiary)]">
          {c.file}
          {c.line ? `:${c.line}` : ""}
        </span>
      ) : null}
      {open && (c.details || c.message) ? (
        <pre className="ml-4 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-[var(--border-color)] bg-[var(--bg-workspace,transparent)] p-2 font-mono text-[11px] text-[var(--text-secondary)]">
          {c.details ?? c.message}
        </pre>
      ) : null}
    </li>
  );
}

function SuiteResultRow({
  suite,
  onFix,
}: {
  suite: SuiteResult;
  onFix?: (suite: SuiteResult) => void;
}) {
  const { t } = useTranslation("openhands");
  const [open, setOpen] = React.useState(suite.status !== "passed");
  const failures = suite.cases.filter(
    (c) =>
      c.status === "failed" || c.status === "error" || c.status === "flaky",
  );
  return (
    <li
      data-testid={`testing-result-${suite.id}`}
      data-status={suite.status}
      className="flex flex-col gap-1 rounded-[var(--radius-sm)] border border-[var(--border-color)] p-2"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="ame-badge ame-badge-neutral">
          {KIND_LABELS[suite.kind]}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-primary)]">
          {suite.name}
        </span>
        <span
          className={cn(
            "ame-badge",
            suite.status === "passed"
              ? "ame-badge-success"
              : suite.status === "timeout"
                ? "ame-badge-warning"
                : "ame-badge-danger",
          )}
        >
          {suite.status}
        </span>
        <span className="text-xs text-[var(--text-tertiary)]">
          {suite.exitCodeOnly
            ? t(I18nKey.TESTING$EXIT_CODE_ONLY)
            : t(I18nKey.TESTING$SUITE_COUNTS, {
                passed: suite.counts.passed,
                total: suite.counts.total - suite.counts.skipped,
              })}
          {suite.durationMs !== undefined
            ? ` · ${Math.round(suite.durationMs / 1000)}s`
            : ""}
        </span>
      </button>
      {open ? (
        <div className="flex flex-col gap-2 pl-6">
          {onFix && suite.status !== "passed" ? (
            <div>
              <button
                type="button"
                data-testid={`testing-fix-suite-${suite.id}`}
                onClick={() => onFix(suite)}
                className="ame-btn-primary ame-btn-xs"
              >
                {t(I18nKey.TESTING$ASK_FIX)}
              </button>
            </div>
          ) : null}
          {failures.length ? (
            <ul className="flex flex-col gap-1">
              {failures.slice(0, 50).map((c) => (
                <CaseRow key={c.id} c={c} />
              ))}
            </ul>
          ) : null}
          {suite.warnings.length ? (
            <ul className="text-[11px] text-[var(--warning-600,#b45309)]">
              {suite.warnings.slice(0, 5).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          {(suite.status !== "passed" || suite.exitCodeOnly) &&
          (suite.stderrTail || suite.stdoutTail) ? (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-[var(--border-color)] bg-[var(--bg-workspace,transparent)] p-2 font-mono text-[11px] text-[var(--text-secondary)]">
              {(suite.stderrTail || suite.stdoutTail || "").slice(-1500)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function ResultsCard({
  report: latest,
  runs = [],
  projectName = "",
  postResult,
}: {
  report: TestReport;
  /** Every run, oldest first; the selector lets the user look back. */
  runs?: TestRun[];
  projectName?: string;
  postResult?: PostResultFn;
}) {
  const { t } = useTranslation("openhands");
  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null);
  const withReports = runs.filter((r) => r.report);
  const report =
    withReports.find((r) => r.id === selectedRunId)?.report ?? latest;
  const onFix = postResult
    ? (suite: SuiteResult) =>
        postResult(
          receipt({
            status: "fix_requested",
            suite_id: suite.id,
            failures: suite.cases
              .filter((c) => c.status === "failed" || c.status === "error")
              .slice(0, 20)
              .map((c) => ({
                test: c.name,
                file: c.file,
                line: c.line,
                message: c.message?.slice(0, 200),
              })),
            guidance:
              "The user asked you to fix these failures in the application code (fix_app). Fix, run this suite again, prove the touched files, and record_finding for each bug with status fixed.",
          }),
        )
    : undefined;
  const exportMd = () =>
    downloadFile({
      path: `${report.runId}-REPORT.md`,
      content: reportMarkdown(report, projectName),
      mimeType: "text/markdown",
    });
  const exportJson = () =>
    downloadFile({
      path: `${report.runId}-report.json`,
      content: JSON.stringify(report, null, 2),
      mimeType: "application/json",
    });
  const rate = passRate(report.counts);
  const p95 = report.perf.length
    ? Math.max(...report.perf.map((p) => p.p95Ms ?? 0))
    : undefined;
  const failedChecks = report.checks.filter((c) => c.status !== "pass");
  const sec = report.security.filter(
    (f) => f.severity === "critical" || f.severity === "high",
  );
  const a11y = report.accessibility.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  return (
    <section
      data-testid="testing-results"
      className="ame-card flex flex-col gap-3 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="ame-eyebrow flex items-center gap-1">
          <Gauge size={12} aria-hidden /> {t(I18nKey.TESTING$RESULTS_TITLE)}
        </span>
        <div className="flex items-center gap-1">
          {withReports.length > 1 ? (
            <select
              aria-label={t(I18nKey.TESTING$RUN_SELECT)}
              data-testid="testing-run-select"
              value={report.runId}
              onChange={(e) => setSelectedRunId(e.target.value)}
              className="ame-input rounded border border-[var(--border-color)] bg-transparent px-1 py-0.5 font-mono text-[11px]"
            >
              {[...withReports].reverse().map((r) => (
                <option key={r.id} value={r.id}>
                  {r.report!.finishedAt.slice(0, 16).replace("T", " ")} ·{" "}
                  {r.report!.gates.verdict}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            data-testid="testing-export-md"
            onClick={exportMd}
            aria-label={t(I18nKey.TESTING$EXPORT_MD)}
            title={t(I18nKey.TESTING$EXPORT_MD)}
            className="ame-btn-icon ame-btn-icon-sm"
          >
            <Download size={12} />
          </button>
          <button
            type="button"
            data-testid="testing-export-json"
            onClick={exportJson}
            className="ame-btn-ghost ame-btn-xs"
          >
            {t(I18nKey.TESTING$EXPORT_JSON)}
          </button>
        </div>
      </div>
      <VerdictBanner report={report} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          testId="testing-result-pass-rate"
          label={t(I18nKey.TESTING$STAT_PASS_RATE)}
          value={formatPct(rate)}
          tone={rate === undefined ? undefined : rate === 100 ? "good" : "bad"}
        />
        <Stat
          testId="testing-result-failed"
          label={t(I18nKey.TESTING$STAT_FAILED)}
          value={String(report.counts.failed + report.counts.error)}
          tone={report.counts.failed + report.counts.error ? "bad" : "good"}
        />
        <Stat
          testId="testing-result-flaky"
          label={t(I18nKey.TESTING$STAT_FLAKY)}
          value={String(report.counts.flaky)}
          tone={report.counts.flaky ? "warn" : undefined}
        />
        <Stat
          testId="testing-result-p95"
          label={t(I18nKey.TESTING$STAT_P95)}
          value={formatMs(p95)}
        />
      </div>
      {report.coverage ? (
        <div
          data-testid="testing-coverage"
          className="grid grid-cols-1 gap-2 sm:grid-cols-3"
        >
          <CoverageBar
            pct={report.coverage.lines.pct}
            label={t(I18nKey.TESTING$COVERAGE_LINES)}
          />
          {report.coverage.branches ? (
            <CoverageBar
              pct={report.coverage.branches.pct}
              label={t(I18nKey.TESTING$COVERAGE_BRANCHES)}
            />
          ) : null}
          {report.coverage.functions ? (
            <CoverageBar
              pct={report.coverage.functions.pct}
              label={t(I18nKey.TESTING$COVERAGE_FUNCTIONS)}
            />
          ) : null}
        </div>
      ) : null}
      <ul className="flex flex-col gap-1">
        {report.suites.map((s) => (
          <SuiteResultRow key={s.id} suite={s} onFix={onFix} />
        ))}
      </ul>
      {report.perf.length ? (
        <div data-testid="testing-perf" className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[var(--text-tertiary)]">
              <tr>
                <th className="py-1 pr-2 font-medium">
                  {t(I18nKey.TESTING$PERF_SCENARIO)}
                </th>
                <th className="py-1 pr-2 font-medium">RPS</th>
                {/* eslint-disable-next-line i18next/no-literal-string */}
                <th className="py-1 pr-2 font-medium">p50</th>
                {/* eslint-disable-next-line i18next/no-literal-string */}
                <th className="py-1 pr-2 font-medium">p95</th>
                {/* eslint-disable-next-line i18next/no-literal-string */}
                <th className="py-1 pr-2 font-medium">p99</th>
                <th className="py-1 pr-2 font-medium">
                  {t(I18nKey.TESTING$PERF_ERRORS)}
                </th>
              </tr>
            </thead>
            <tbody className="text-[var(--text-secondary)]">
              {report.perf.map((p) => (
                <tr
                  key={p.name}
                  className="border-t border-[var(--border-color)]"
                >
                  <td className="py-1 pr-2 font-mono">{p.name}</td>
                  <td className="py-1 pr-2">
                    {p.rps !== undefined ? round(p.rps, 1) : "—"}
                  </td>
                  <td className="py-1 pr-2">{formatMs(p.p50Ms)}</td>
                  <td className="py-1 pr-2">{formatMs(p.p95Ms)}</td>
                  <td className="py-1 pr-2">{formatMs(p.p99Ms)}</td>
                  <td className="py-1 pr-2">{formatPct(p.errorRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {report.checks.length ? (
        <div data-testid="testing-data-checks" className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-[var(--text-primary)]">
            {t(I18nKey.TESTING$DATA_CHECKS, {
              passed: report.checks.length - failedChecks.length,
              total: report.checks.length,
            })}
          </span>
          <ul className="flex flex-col gap-0.5 text-xs text-[var(--text-secondary)]">
            {failedChecks.slice(0, 30).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-1">
                <span className={SEVERITY_BADGE[c.severity]}>{c.severity}</span>
                <span className="ame-badge ame-badge-danger">{c.status}</span>
                <span>
                  {c.dataset
                    ? `${c.dataset}${c.column ? `.${c.column}` : ""}: `
                    : ""}
                  {c.name}
                  {c.unexpectedCount !== undefined
                    ? ` (${c.unexpectedCount})`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {report.security.length ? (
        <div data-testid="testing-security" className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-[var(--text-primary)]">
            {t(I18nKey.TESTING$SECURITY_FINDINGS, {
              count: report.security.length,
              severe: sec.length,
            })}
          </span>
          <ul className="flex flex-col gap-0.5 text-xs text-[var(--text-secondary)]">
            {[...sec, ...report.security.filter((f) => !sec.includes(f))]
              .slice(0, 20)
              .map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-1">
                  <span className={SEVERITY_BADGE[f.severity]}>
                    {f.severity}
                  </span>
                  <span>{f.title}</span>
                  {f.package ? (
                    <span className="font-mono text-[var(--text-tertiary)]">
                      {f.package}
                      {f.version ? `@${f.version}` : ""}
                    </span>
                  ) : null}
                </li>
              ))}
          </ul>
        </div>
      ) : null}
      {report.accessibility.length ? (
        <div data-testid="testing-a11y" className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-[var(--text-primary)]">
            {t(I18nKey.TESTING$A11Y_VIOLATIONS, {
              count: report.accessibility.length,
              severe: a11y.length,
            })}
          </span>
          <ul className="flex flex-col gap-0.5 text-xs text-[var(--text-secondary)]">
            {report.accessibility.slice(0, 20).map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-1">
                <span
                  className={cn(
                    "ame-badge",
                    v.impact === "critical" || v.impact === "serious"
                      ? "ame-badge-danger"
                      : "ame-badge-warning",
                  )}
                >
                  {v.impact}
                </span>
                <span>
                  {v.rule}: {v.description} ({v.nodes})
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {report.mutation ? (
        <div data-testid="testing-mutation" className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-[var(--text-primary)]">
            {t(I18nKey.TESTING$MUTATION_SUMMARY, {
              killed: report.mutation.killed,
              total: report.mutation.total,
              score: formatPct(report.mutation.score),
            })}
          </span>
          {report.mutation.survivors.length ? (
            <ul className="text-xs text-[var(--text-secondary)]">
              {report.mutation.survivors.slice(0, 10).map((s, i) => (
                <li key={`${s.file}-${s.line}-${i}`} className="font-mono">
                  {s.file}
                  {s.line ? `:${s.line}` : ""} {s.mutator}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {report.coverage?.hotspots.length ? (
        <div data-testid="testing-hotspots" className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold text-[var(--text-primary)]">
            {t(I18nKey.TESTING$HOTSPOTS)}
          </span>
          <ul className="text-[11px] text-[var(--text-secondary)]">
            {report.coverage.hotspots.slice(0, 6).map((h) => (
              <li key={h.file} className="flex justify-between gap-2 font-mono">
                <span className="truncate">{h.file}</span>
                <span className="shrink-0">
                  {h.uncoveredLines} · {formatPct(h.pct)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {report.kindsNotRun.length ? (
        <p className="text-xs text-[var(--text-tertiary)]">
          {t(I18nKey.TESTING$KINDS_NOT_RUN)}:{" "}
          {report.kindsNotRun.map((k) => KIND_LABELS[k]).join(", ")}
        </p>
      ) : null}
    </section>
  );
}
