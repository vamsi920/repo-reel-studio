/**
 * Builds the normalized TestReport from the plan, the harness status and the
 * parsed artifacts; computes the trend against the previous report; renders
 * the Markdown the project keeps on disk.
 *
 * @spec NT-004 — Parsing is the studio's job
 * @spec NT-006 — Report, always present
 */
import type {
  CoverageSummary,
  GateRule,
  HarnessStatus,
  ParsedArtifact,
  SuitePlan,
  SuiteResult,
  TestCase,
  TestKind,
  TestReport,
  TrendDelta,
} from "./model";
import {
  EMPTY_COUNTS,
  KIND_LABELS,
  TEST_KINDS,
  addCounts,
  countCases,
  metric,
  passRate,
  round,
} from "./model";
import { evaluateGates } from "./gates";

export const REPORT_VERSION = 1;
const MAX_CASES_PER_SUITE = 400;
const MAX_TAIL = 2000;

function mergeCoverage(parts: CoverageSummary[]): CoverageSummary | undefined {
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  const sum = (
    pick: (
      c: CoverageSummary,
    ) => { covered: number; total: number } | undefined,
  ) => {
    const present = parts
      .map(pick)
      .filter((m): m is { covered: number; total: number } => !!m);
    if (present.length === 0) return undefined;
    return metric(
      present.reduce((a, m) => a + m.covered, 0),
      present.reduce((a, m) => a + m.total, 0),
    );
  };
  return {
    lines: sum((c) => c.lines) ?? metric(0, 0),
    branches: sum((c) => c.branches),
    functions: sum((c) => c.functions),
    statements: sum((c) => c.statements),
    hotspots: parts
      .flatMap((c) => c.hotspots)
      .sort((a, b) => b.uncoveredLines - a.uncoveredLines)
      .slice(0, 10),
    source: parts[0].source,
  };
}

/** Flaky across runs: a case that passed and failed on the same commit. */
export function flakyAcrossRuns(
  current: TestReport,
  previous: TestReport | undefined,
): TestCase[] {
  const flaky = current.suites.flatMap((s) =>
    s.cases.filter((c) => c.status === "flaky"),
  );
  // Same code is the same working tree when the harness hashed it, else the
  // same commit (an uncommitted fix would otherwise read as flakiness).
  const sameCode = current.treeHash
    ? previous?.treeHash === current.treeHash
    : Boolean(current.commit) && previous?.commit === current.commit;
  if (!previous || !sameCode) return flaky;
  const prevById = new Map(
    previous.suites
      .flatMap((s) => s.cases)
      .map((c) => [c.id, c.status] as const),
  );
  for (const suite of current.suites) {
    for (const c of suite.cases) {
      const before = prevById.get(c.id);
      if (!before || c.status === "flaky" || c.status === "skipped") continue;
      const flipped =
        (before === "passed" &&
          (c.status === "failed" || c.status === "error")) ||
        ((before === "failed" || before === "error") && c.status === "passed");
      if (flipped && !flaky.some((f) => f.id === c.id)) {
        flaky.push({
          ...c,
          retries: c.retries,
          message:
            c.message ?? `was ${before} in the previous run on the same commit`,
        });
      }
    }
  }
  return flaky;
}

export function buildSuiteResult(
  plan: SuitePlan,
  status: HarnessStatus["suites"][number] | undefined,
  artifacts: ParsedArtifact[],
): SuiteResult {
  const cases = artifacts
    .flatMap((a) => a.cases ?? [])
    .slice(0, MAX_CASES_PER_SUITE);
  const coverage = mergeCoverage(
    artifacts.map((a) => a.coverage).filter((c): c is CoverageSummary => !!c),
  );
  const perf = artifacts.flatMap((a) => a.perf ?? []);
  const checks = artifacts.flatMap((a) => a.checks ?? []);
  const security = artifacts.flatMap((a) => a.security ?? []);
  const accessibility = artifacts.flatMap((a) => a.accessibility ?? []);
  const mutation = artifacts.map((a) => a.mutation).find(Boolean);
  const parsedSomething =
    cases.length > 0 ||
    !!coverage ||
    perf.length > 0 ||
    checks.length > 0 ||
    security.length > 0 ||
    accessibility.length > 0 ||
    !!mutation;
  const warnings = [
    ...artifacts.flatMap((a) => a.warnings),
    ...(status?.artifacts
      .filter((a) => a.missing)
      .map((a) => `${a.path}: not produced`) ?? []),
  ];
  let runStatus = status?.status ?? "pending";
  // A green exit code with failed cases in the artifact is still a failure.
  if (
    runStatus === "passed" &&
    cases.some((c) => c.status === "failed" || c.status === "error")
  ) {
    runStatus = "failed";
  }
  return {
    id: plan.id,
    kind: plan.kind,
    name: plan.name,
    command: plan.command,
    status: runStatus,
    exitCode: status?.exitCode,
    durationMs: status?.durationMs,
    counts: countCases(cases),
    cases,
    exitCodeOnly: !parsedSomething && !!status && status.status !== "pending",
    coverage,
    perf: perf.length ? perf : undefined,
    checks: checks.length ? checks : undefined,
    security: security.length ? security : undefined,
    accessibility: accessibility.length ? accessibility : undefined,
    mutation,
    stdoutTail: status?.stdoutTail?.slice(-MAX_TAIL),
    stderrTail: status?.stderrTail?.slice(-MAX_TAIL),
    warnings,
    origin: plan.origin,
  };
}

export function computeTrend(
  current: TestReport,
  previous: TestReport | undefined,
): TrendDelta | undefined {
  if (!previous) return undefined;
  const d = (a: number | undefined, b: number | undefined) =>
    a !== undefined && b !== undefined ? round(a - b, 2) : undefined;
  const p95 = (r: TestReport) =>
    r.perf.length ? Math.max(...r.perf.map((p) => p.p95Ms ?? 0)) : undefined;
  return {
    passRate: d(passRate(current.counts), passRate(previous.counts)),
    lineCoverage: d(current.coverage?.lines.pct, previous.coverage?.lines.pct),
    p95Ms: d(p95(current), p95(previous)),
    failed:
      current.counts.failed +
      current.counts.error -
      (previous.counts.failed + previous.counts.error),
    flaky: current.counts.flaky - previous.counts.flaky,
    findings:
      current.security.length +
      current.accessibility.length -
      (previous.security.length + previous.accessibility.length),
  };
}

export interface BuildReportInput {
  runId: string;
  projectId: string;
  plan: SuitePlan[];
  /** Suites this run executed (ids); the rest are "not run". */
  executed: string[];
  status: HarnessStatus | null;
  artifactsBySuite: Record<string, ParsedArtifact[]>;
  gates: GateRule[];
  previous?: TestReport;
  trigger: TestReport["trigger"];
  startedAt: string;
  finishedAt: string;
  /** Mutation results attached to a run by `prove`. */
  mutation?: ParsedArtifact;
}

export function buildReport(input: BuildReportInput): TestReport {
  const suites = input.plan
    .filter((p) => !p.notApplicable && input.executed.includes(p.id))
    .map((p) =>
      buildSuiteResult(
        p,
        input.status?.suites.find((s) => s.id === p.id),
        input.artifactsBySuite[p.id] ?? [],
      ),
    );
  const counts = suites.reduce((acc, s) => addCounts(acc, s.counts), {
    ...EMPTY_COUNTS,
  });
  const coverage = mergeCoverage(
    suites.map((s) => s.coverage).filter((c): c is CoverageSummary => !!c),
  );
  const mutation =
    input.mutation?.mutation ?? suites.map((s) => s.mutation).find(Boolean);
  const ranKinds = new Set(suites.map((s) => s.kind));
  const kindsNotRun = input.plan
    .filter((p) => !p.notApplicable && !ranKinds.has(p.kind))
    .map((p) => p.kind)
    .filter((k, i, arr) => arr.indexOf(k) === i);
  const report: TestReport = {
    version: REPORT_VERSION,
    runId: input.runId,
    projectId: input.projectId,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    commit: input.status?.commit,
    branch: input.status?.branch,
    treeHash: input.status?.treeHash,
    trigger: input.trigger,
    suites,
    counts,
    coverage,
    perf: suites.flatMap((s) => s.perf ?? []),
    checks: suites.flatMap((s) => s.checks ?? []),
    security: suites.flatMap((s) => s.security ?? []),
    accessibility: suites.flatMap((s) => s.accessibility ?? []),
    mutation,
    flaky: [],
    gates: { verdict: "not_measured", results: [] },
    previousRunId: input.previous?.runId,
    kindsNotRun,
    warnings: [
      ...suites.flatMap((s) => s.warnings.map((w) => `${s.name}: ${w}`)),
      ...(input.mutation?.warnings ?? []),
    ],
  };
  report.flaky = flakyAcrossRuns(report, input.previous);
  report.counts = { ...report.counts, flaky: report.flaky.length };
  report.trend = computeTrend(report, input.previous);
  report.gates = evaluateGates(report, input.gates);
  return report;
}

/* ── Markdown ──────────────────────────────────────────────────────────── */

const pct = (v: number | undefined) =>
  v === undefined ? "—" : `${round(v, 1)}%`;
const ms = (v: number | undefined) =>
  v === undefined ? "—" : `${Math.round(v)} ms`;
const verdictWord: Record<TestReport["gates"]["verdict"], string> = {
  passed: "PASSED",
  failed: "FAILED",
  warned: "PASSED WITH WARNINGS",
  not_measured: "NOT MEASURED",
};

export function reportMarkdown(
  report: TestReport,
  projectName: string,
): string {
  const lines: string[] = [];
  lines.push(`# Test report — ${projectName}`);
  lines.push("");
  lines.push(
    `Run \`${report.runId}\` · ${report.finishedAt}${report.commit ? ` · commit ${report.commit.slice(0, 10)}` : ""}${report.branch ? ` (${report.branch})` : ""}`,
  );
  lines.push("");
  lines.push(`## Quality gate: ${verdictWord[report.gates.verdict]}`);
  lines.push("");
  for (const r of report.gates.results) {
    const mark =
      r.verdict === "passed"
        ? "✅"
        : r.verdict === "failed"
          ? "❌"
          : r.verdict === "warned"
            ? "⚠️"
            : "➖";
    lines.push(
      `- ${mark} ${r.rule.id}: ${r.rule.metric} ${r.rule.op} ${r.rule.threshold}${r.actual !== undefined ? ` (actual ${r.actual})` : r.verdict === "not_measured" ? " (not measured)" : ""}`,
    );
  }
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`| Tests | Passed | Failed | Skipped | Flaky | Pass rate |`);
  lines.push(`|---|---|---|---|---|---|`);
  lines.push(
    `| ${report.counts.total} | ${report.counts.passed} | ${report.counts.failed + report.counts.error} | ${report.counts.skipped} | ${report.counts.flaky} | ${pct(passRate(report.counts))} |`,
  );
  lines.push("");
  if (report.coverage) {
    lines.push(
      `Coverage: lines ${pct(report.coverage.lines.pct)}${report.coverage.branches ? `, branches ${pct(report.coverage.branches.pct)}` : ""}${report.trend?.lineCoverage !== undefined ? ` (${report.trend.lineCoverage >= 0 ? "+" : ""}${report.trend.lineCoverage} pts vs previous)` : ""}`,
    );
    lines.push("");
  }
  lines.push("## Suites");
  lines.push("");
  lines.push("| Kind | Suite | Status | Tests | Failed | Duration |");
  lines.push("|---|---|---|---|---|---|");
  for (const s of report.suites) {
    lines.push(
      `| ${KIND_LABELS[s.kind]} | ${s.name} | ${s.status}${s.exitCodeOnly ? " (exit code only)" : ""} | ${s.counts.total} | ${s.counts.failed + s.counts.error} | ${s.durationMs !== undefined ? `${Math.round(s.durationMs / 1000)} s` : "—"} |`,
    );
  }
  if (report.kindsNotRun.length) {
    lines.push("");
    lines.push(
      `Not run in this report: ${report.kindsNotRun.map((k: TestKind) => KIND_LABELS[k]).join(", ")}.`,
    );
  }
  const failures = report.suites.flatMap((s) =>
    s.cases
      .filter((c) => c.status === "failed" || c.status === "error")
      .map((c) => ({ s, c })),
  );
  if (failures.length) {
    lines.push("");
    lines.push("## Failures");
    lines.push("");
    for (const { s, c } of failures.slice(0, 50)) {
      lines.push(
        `- **${c.name}** (${s.name}${c.file ? `, ${c.file}${c.line ? `:${c.line}` : ""}` : ""})${c.message ? `: ${c.message.split("\n")[0]}` : ""}`,
      );
    }
  }
  if (report.flaky.length) {
    lines.push("");
    lines.push("## Flaky tests");
    lines.push("");
    for (const c of report.flaky.slice(0, 30))
      lines.push(`- ${c.name}${c.file ? ` (${c.file})` : ""}`);
  }
  if (report.perf.length) {
    lines.push("");
    lines.push("## Performance");
    lines.push("");
    lines.push("| Scenario | Requests | RPS | p50 | p95 | p99 | Errors |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const p of report.perf) {
      lines.push(
        `| ${p.name} | ${p.requests} | ${p.rps !== undefined ? round(p.rps, 1) : "—"} | ${ms(p.p50Ms)} | ${ms(p.p95Ms)} | ${ms(p.p99Ms)} | ${pct(p.errorRate)} |`,
      );
    }
  }
  if (report.checks.length) {
    lines.push("");
    lines.push("## Data checks");
    lines.push("");
    const failed = report.checks.filter((c) => c.status !== "pass");
    lines.push(
      `${report.checks.length - failed.length} of ${report.checks.length} passed.`,
    );
    for (const c of failed.slice(0, 40)) {
      lines.push(
        `- ${c.status.toUpperCase()} [${c.severity}] ${c.dataset ? `${c.dataset}${c.column ? `.${c.column}` : ""}: ` : ""}${c.name}${c.unexpectedCount !== undefined ? ` (${c.unexpectedCount} unexpected)` : ""}`,
      );
    }
  }
  if (report.security.length) {
    lines.push("");
    lines.push("## Security");
    lines.push("");
    for (const f of report.security.slice(0, 40)) {
      lines.push(
        `- [${f.severity}] ${f.title}${f.package ? ` — ${f.package}${f.version ? `@${f.version}` : ""}` : ""}${f.fixedIn ? ` (fixed in ${f.fixedIn})` : ""}`,
      );
    }
  }
  if (report.accessibility.length) {
    lines.push("");
    lines.push("## Accessibility");
    lines.push("");
    for (const v of report.accessibility.slice(0, 40)) {
      lines.push(
        `- [${v.impact}] ${v.rule}: ${v.description} (${v.nodes} elements${v.page ? `, ${v.page}` : ""})`,
      );
    }
  }
  if (report.mutation) {
    lines.push("");
    lines.push("## Mutation");
    lines.push("");
    lines.push(
      `${report.mutation.killed} of ${report.mutation.total} mutants killed (score ${pct(report.mutation.score)}).`,
    );
    for (const s of report.mutation.survivors.slice(0, 20)) {
      lines.push(
        `- survived: ${s.file}${s.line ? `:${s.line}` : ""}${s.mutator ? ` (${s.mutator})` : ""}`,
      );
    }
  }
  if (report.coverage?.hotspots.length) {
    lines.push("");
    lines.push("## Least covered files");
    lines.push("");
    for (const h of report.coverage.hotspots)
      lines.push(
        `- ${h.file}: ${h.uncoveredLines} uncovered lines (${pct(h.pct)})`,
      );
  }
  if (report.warnings.length) {
    lines.push("");
    lines.push("## Warnings");
    lines.push("");
    for (const w of report.warnings.slice(0, 30)) lines.push(`- ${w}`);
  }
  lines.push("");
  lines.push(
    "_Generated by Neo Test. Numbers come from the runner artifacts, not from the agent._",
  );
  return `${lines.join("\n")}\n`;
}

/** One-line verdict for lists and receipts. */
export function reportHeadline(report: TestReport): string {
  const kinds = TEST_KINDS.filter((k) =>
    report.suites.some((s) => s.kind === k),
  ).map((k) => KIND_LABELS[k]);
  return `${verdictWord[report.gates.verdict]} · ${report.counts.passed}/${report.counts.total - report.counts.skipped} tests passed${report.coverage?.lines.pct !== undefined ? ` · ${pct(report.coverage.lines.pct)} lines` : ""}${kinds.length ? ` · ${kinds.join(", ")}` : ""}`;
}
