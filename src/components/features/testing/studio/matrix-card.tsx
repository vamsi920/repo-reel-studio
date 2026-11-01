import React from "react";
import { useTranslation } from "react-i18next";
import { Grid3x3 } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import type { TestProject } from "#/stores/test-studio-store";
import {
  KIND_LABELS,
  TEST_KINDS,
  type TestKind,
  type TestReport,
} from "#/lib/testing/model";

type CellState =
  | "missing"
  | "not_applicable"
  | "planned"
  | "passed"
  | "failed"
  | "running";

const CELL_CLASS: Record<CellState, string> = {
  missing: "bg-[var(--border-color)] text-[var(--text-tertiary)]",
  not_applicable:
    "bg-[var(--background-secondary)] text-[var(--text-tertiary)]",
  planned: "bg-[var(--primary-bg-subtle)] text-[var(--primary-600)]",
  passed:
    "bg-[var(--success-50,rgba(21,128,61,0.12))] text-[var(--success-600,#15803d)]",
  failed:
    "bg-[var(--danger-50,rgba(220,38,38,0.12))] text-[var(--danger-500,#dc2626)]",
  running:
    "bg-[var(--primary-bg-subtle)] text-[var(--primary-600)] animate-pulse",
};

const CELL_KEY: Record<CellState, I18nKey> = {
  missing: I18nKey.TESTING$MATRIX_MISSING,
  not_applicable: I18nKey.TESTING$NOT_APPLICABLE,
  planned: I18nKey.TESTING$MATRIX_PLANNED,
  passed: I18nKey.TESTING$MATRIX_PASSED,
  failed: I18nKey.TESTING$MATRIX_FAILED,
  running: I18nKey.TESTING$RUNNING,
};

/** One cell per kind: the plan, the latest result and the tool that ran. */
export function kindState(
  project: TestProject,
  kind: TestKind,
  report: TestReport | undefined,
): { state: CellState; tool?: string; tests?: number } {
  const suites = project.plan.filter((s) => s.kind === kind);
  if (suites.length === 0) {
    // Mutation can be proven without a suite.
    if (kind === "mutation" && report?.mutation) {
      return {
        state:
          report.mutation.score !== undefined && report.mutation.score >= 60
            ? "passed"
            : "failed",
        tool:
          report.mutation.source === "neotest_mutation"
            ? "prove"
            : report.mutation.source,
        tests: report.mutation.total,
      };
    }
    return { state: "missing" };
  }
  const applicable = suites.filter((s) => !s.notApplicable);
  if (applicable.length === 0) return { state: "not_applicable" };
  const running = project.runs.find((r) => r.status === "running");
  if (running && applicable.some((s) => running.progress[s.id] === "running")) {
    return { state: "running" };
  }
  const results = (report?.suites ?? []).filter((s) => s.kind === kind);
  if (results.length === 0)
    return { state: "planned", tool: applicable[0].command.split(/\s+/)[0] };
  const failed = results.some((s) => s.status !== "passed");
  const tool =
    results[0].command
      .split(/\s+/)
      .find((w) => !w.includes("=") && !w.startsWith("-")) ??
    results[0].command.split(/\s+/)[0];
  return {
    state: failed ? "failed" : "passed",
    tool: tool.replace(/^npx$/, results[0].command.split(/\s+/)[2] ?? "npx"),
    tests: results.reduce((a, s) => a + s.counts.total, 0),
  };
}

export function MatrixCard({
  project,
  report,
}: {
  project: TestProject;
  report?: TestReport;
}) {
  const { t } = useTranslation("openhands");
  const cells = TEST_KINDS.map((kind) => ({
    kind,
    ...kindState(project, kind, report),
  }));
  const covered = cells.filter(
    (c) => c.state === "passed" || c.state === "failed",
  ).length;
  const applicable = cells.filter((c) => c.state !== "not_applicable").length;
  return (
    <section
      data-testid="testing-matrix"
      className="ame-card flex flex-col gap-3 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="ame-eyebrow flex items-center gap-1">
          <Grid3x3 size={12} aria-hidden /> {t(I18nKey.TESTING$MATRIX_TITLE)}
        </span>
        <span className="text-xs text-[var(--text-tertiary)]">
          {t(I18nKey.TESTING$MATRIX_SUMMARY, { covered, total: applicable })}
        </span>
      </div>
      <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
        {cells.map((cell) => (
          <li
            key={cell.kind}
            data-testid={`testing-matrix-${cell.kind}`}
            data-state={cell.state}
            className={cn(
              "flex flex-col gap-0.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-[11px]",
              CELL_CLASS[cell.state],
            )}
          >
            <span className="font-semibold text-[var(--text-primary)]">
              {KIND_LABELS[cell.kind]}
            </span>
            <span>{t(CELL_KEY[cell.state])}</span>
            {cell.tool ? (
              <span className="truncate font-mono opacity-80">
                {cell.tool}
                {cell.tests !== undefined ? ` · ${cell.tests}` : ""}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
