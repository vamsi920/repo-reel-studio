/**
 * CTRF (Common Test Report Format, MIT, ctrf-io/ctrf) export of a Neo Test
 * report, so every other CTRF consumer (GitHub summaries, Slack reporters,
 * dashboards) can read what Neo measured. One schema across all kinds.
 */
import type { TestReport } from "./model";

export interface CtrfReport {
  results: {
    tool: { name: string; version?: string };
    summary: {
      tests: number;
      passed: number;
      failed: number;
      skipped: number;
      pending: number;
      other: number;
      start: number;
      stop: number;
    };
    tests: {
      name: string;
      status: "passed" | "failed" | "skipped" | "pending" | "other";
      duration: number;
      suite?: string;
      filePath?: string;
      line?: number;
      message?: string;
      trace?: string;
      flaky?: boolean;
      retries?: number;
      type?: string;
    }[];
    environment?: Record<string, string>;
    extra?: Record<string, unknown>;
  };
}

export function toCtrf(report: TestReport, appName?: string): CtrfReport {
  const tests = report.suites.flatMap((s) =>
    s.cases.map((c) => ({
      name: c.name,
      status:
        c.status === "passed" || c.status === "flaky"
          ? ("passed" as const)
          : c.status === "failed" || c.status === "error"
            ? ("failed" as const)
            : c.status === "skipped"
              ? ("skipped" as const)
              : ("other" as const),
      duration: c.durationMs ?? 0,
      suite: c.suite ?? s.name,
      filePath: c.file,
      line: c.line,
      message: c.message,
      trace: c.details,
      flaky: c.status === "flaky" || undefined,
      retries: c.retries,
      type: s.kind,
    })),
  );
  return {
    results: {
      tool: { name: "neo-test" },
      summary: {
        tests: tests.length,
        passed: tests.filter((t) => t.status === "passed").length,
        failed: tests.filter((t) => t.status === "failed").length,
        skipped: tests.filter((t) => t.status === "skipped").length,
        pending: 0,
        other: tests.filter((t) => t.status === "other").length,
        start: Date.parse(report.startedAt) || 0,
        stop: Date.parse(report.finishedAt) || 0,
      },
      tests,
      environment: {
        ...(appName ? { appName } : {}),
        ...(report.commit ? { commit: report.commit } : {}),
        ...(report.branch ? { branchName: report.branch } : {}),
      },
      extra: {
        runId: report.runId,
        gate: report.gates.verdict,
        coverageLinesPct: report.coverage?.lines.pct,
        p95Ms: report.perf.length
          ? Math.max(...report.perf.map((p) => p.p95Ms ?? 0))
          : undefined,
        mutationScore: report.mutation?.score,
        findings: {
          security: report.security.length,
          accessibility: report.accessibility.length,
          dataChecksFailed: report.checks.filter((c) => c.status !== "pass")
            .length,
        },
      },
    },
  };
}
