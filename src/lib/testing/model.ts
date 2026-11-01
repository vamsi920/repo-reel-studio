/**
 * Neo Test: the one shape every runner, coverage tool, load tester,
 * scanner and data checker is parsed into. Pure types and small helpers.
 *
 * Spec: specs/neo-test.md
 */

// @spec NT-002 — Test kinds
export const TEST_KINDS = [
  "unit",
  "integration",
  "api",
  "e2e",
  "performance",
  "data",
  "security",
  "accessibility",
  "contract",
  "mutation",
] as const;
export type TestKind = (typeof TEST_KINDS)[number];

export const KIND_LABELS: Record<TestKind, string> = {
  unit: "Unit",
  integration: "Integration",
  api: "API",
  e2e: "End-to-end",
  performance: "Performance",
  data: "Data quality",
  security: "Security",
  accessibility: "Accessibility",
  contract: "Contract",
  mutation: "Mutation",
};

/** Artifact formats the studio parses. `auto` detects by name and content. */
export const ARTIFACT_FORMATS = [
  "auto",
  "junit",
  "jest",
  "pytest",
  "gotest",
  "lcov",
  "cobertura",
  "istanbul_summary",
  "coveragepy",
  "k6",
  "autocannon",
  "axe",
  "npm_audit",
  "pip_audit",
  "semgrep",
  "trivy",
  "neotest_checks",
  "great_expectations",
  "stryker",
  "neotest_mutation",
  "oha",
  "vegeta",
  "bombardier",
  "lighthouse",
  "pa11y",
  "gitleaks",
  "nuclei",
  "cargo_audit",
  "govulncheck",
  "osv_scanner",
  "cargo_mutants",
  "backstop",
  "ctrf",
] as const;
export type ArtifactFormat = (typeof ARTIFACT_FORMATS)[number];

/** One suite in the plan: what to run and where its results land. */
export interface SuitePlan {
  id: string;
  kind: TestKind;
  name: string;
  /** Shell command, run from `cwd` (project root by default). */
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  timeoutSec?: number;
  /** A command run once before `command` (install, start a server). */
  setup?: string;
  /** Run after the suite, even on failure (stop a server). */
  teardown?: string;
  /** Result files the command writes, relative to the project root. */
  results: { path: string; format: ArtifactFormat }[];
  /** Files/dirs the suite covers, for the report and the mutation proof. */
  targets?: string[];
  /** Why the suite exists, in the agent's words (shown to the user). */
  rationale?: string;
  /** Who wrote it: existing project suite or one the agent added. */
  origin: "existing" | "agent";
  /** The kind is not applicable to this stack; `reason` says why. */
  notApplicable?: string;
  evidence?: string[];
}

export type CaseStatus = "passed" | "failed" | "skipped" | "error" | "flaky";

export interface TestCase {
  id: string;
  name: string;
  suite?: string;
  file?: string;
  line?: number;
  status: CaseStatus;
  durationMs?: number;
  retries?: number;
  message?: string;
  /** First lines of the stack / stderr, bounded. */
  details?: string;
}

export interface CaseCounts {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  error: number;
  flaky: number;
}

export interface CoverageMetric {
  covered: number;
  total: number;
  /** 0..100, undefined when total is 0. */
  pct?: number;
}

export interface CoverageSummary {
  lines: CoverageMetric;
  branches?: CoverageMetric;
  functions?: CoverageMetric;
  statements?: CoverageMetric;
  /** Files with the most uncovered lines, for the report. */
  hotspots: { file: string; uncoveredLines: number; pct?: number }[];
  source: ArtifactFormat;
}

export interface PerfScenario {
  name: string;
  requests: number;
  /** Requests per second. */
  rps?: number;
  errorRate?: number;
  p50Ms?: number;
  p90Ms?: number;
  p95Ms?: number;
  p99Ms?: number;
  maxMs?: number;
  vus?: number;
  durationMs?: number;
  /** Tool thresholds with the tool's own verdict (k6). */
  thresholds: { expr: string; passed: boolean }[];
  source: ArtifactFormat;
}

export type CheckStatus = "pass" | "warn" | "fail" | "error";
export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface DataCheck {
  id: string;
  name: string;
  dataset?: string;
  column?: string;
  status: CheckStatus;
  severity: Severity;
  metric?: number | string;
  expected?: string;
  unexpectedCount?: number;
  unexpectedPercent?: number;
  message?: string;
}

export interface SecurityFinding {
  id: string;
  title: string;
  severity: Severity;
  tool: string;
  package?: string;
  version?: string;
  fixedIn?: string;
  file?: string;
  line?: number;
  url?: string;
}

export interface AccessibilityViolation {
  id: string;
  rule: string;
  impact: "critical" | "serious" | "moderate" | "minor";
  description: string;
  nodes: number;
  page?: string;
  helpUrl?: string;
}

export interface MutationSummary {
  total: number;
  killed: number;
  survived: number;
  timeout: number;
  noCoverage: number;
  /** 0..100 of detectable mutants killed; undefined when total is 0. */
  score?: number;
  survivors: {
    file: string;
    line?: number;
    mutator?: string;
    description?: string;
  }[];
  source: ArtifactFormat;
}

/** The parsed content of one artifact file. */
export interface ParsedArtifact {
  path: string;
  format: ArtifactFormat;
  cases?: TestCase[];
  coverage?: CoverageSummary;
  perf?: PerfScenario[];
  checks?: DataCheck[];
  security?: SecurityFinding[];
  accessibility?: AccessibilityViolation[];
  mutation?: MutationSummary;
  warnings: string[];
}

export type SuiteRunStatus =
  | "pending"
  | "running"
  | "passed"
  | "failed"
  | "error"
  | "timeout"
  | "skipped";

/** What the harness recorded for one suite (status.json). */
export interface HarnessSuite {
  id: string;
  status: SuiteRunStatus;
  exitCode?: number | null;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  stdoutTail?: string;
  stderrTail?: string;
  artifacts: {
    path: string;
    format: ArtifactFormat;
    bytes: number;
    missing?: boolean;
  }[];
  error?: string;
}

export interface HarnessStatus {
  version: number;
  runId: string;
  startedAt: string;
  finishedAt?: string;
  commit?: string;
  branch?: string;
  /** Hash of the working tree the run saw (tracked + untracked). */
  treeHash?: string;
  node?: string;
  suites: HarnessSuite[];
}

export interface HarnessMutant {
  file: string;
  line: number;
  from: string;
  to: string;
  killed: boolean;
  exitCode?: number | null;
  durationMs?: number;
  error?: string;
}

export interface HarnessMutation {
  version: number;
  runId: string;
  suiteId: string;
  file: string;
  startedAt: string;
  finishedAt?: string;
  mutants: HarnessMutant[];
}

/** One suite as it appears in the report: plan + harness + parsed results. */
export interface SuiteResult {
  id: string;
  kind: TestKind;
  name: string;
  command: string;
  status: SuiteRunStatus;
  exitCode?: number | null;
  durationMs?: number;
  counts: CaseCounts;
  cases: TestCase[];
  /** The suite produced no parseable artifact: only its exit code counts. */
  exitCodeOnly: boolean;
  coverage?: CoverageSummary;
  perf?: PerfScenario[];
  checks?: DataCheck[];
  security?: SecurityFinding[];
  accessibility?: AccessibilityViolation[];
  mutation?: MutationSummary;
  stdoutTail?: string;
  stderrTail?: string;
  warnings: string[];
  origin: SuitePlan["origin"];
}

export type GateVerdict = "passed" | "failed" | "warned" | "not_measured";

export interface GateRule {
  id: string;
  /** What is measured; see gates.ts for the metric ids. */
  metric: GateMetric;
  op: "<=" | ">=" | "==";
  threshold: number;
  blocking: boolean;
  /** Narrows a rule to a kind or a scenario name. */
  scope?: string;
}

export const GATE_METRICS = [
  "failed_tests",
  "pass_rate",
  "line_coverage",
  "coverage_delta",
  "branch_coverage",
  "p95_ms",
  "p99_ms",
  "error_rate",
  "critical_data_checks_failed",
  "data_checks_failed",
  "security_critical_high",
  "security_total",
  "a11y_critical_serious",
  "a11y_total",
  "mutation_score",
  "flaky_tests",
] as const;
export type GateMetric = (typeof GATE_METRICS)[number];

export interface GateResult {
  rule: GateRule;
  actual?: number;
  verdict: GateVerdict;
  detail?: string;
}

export interface GateReport {
  verdict: GateVerdict;
  results: GateResult[];
}

export interface TrendDelta {
  passRate?: number;
  lineCoverage?: number;
  p95Ms?: number;
  failed?: number;
  flaky?: number;
  findings?: number;
}

export interface TestReport {
  version: number;
  runId: string;
  projectId: string;
  startedAt: string;
  finishedAt: string;
  commit?: string;
  branch?: string;
  treeHash?: string;
  trigger: "agent" | "user" | "schedule";
  suites: SuiteResult[];
  counts: CaseCounts;
  coverage?: CoverageSummary;
  perf: PerfScenario[];
  checks: DataCheck[];
  security: SecurityFinding[];
  accessibility: AccessibilityViolation[];
  mutation?: MutationSummary;
  flaky: TestCase[];
  gates: GateReport;
  previousRunId?: string;
  trend?: TrendDelta;
  /** Kinds planned but not run in this report. */
  kindsNotRun: TestKind[];
  warnings: string[];
}

export const EMPTY_COUNTS: CaseCounts = Object.freeze({
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  error: 0,
  flaky: 0,
});

export function countCases(cases: readonly TestCase[]): CaseCounts {
  const counts: CaseCounts = { ...EMPTY_COUNTS };
  for (const c of cases) {
    counts.total += 1;
    counts[c.status] += 1;
  }
  return counts;
}

export function addCounts(a: CaseCounts, b: CaseCounts): CaseCounts {
  return {
    total: a.total + b.total,
    passed: a.passed + b.passed,
    failed: a.failed + b.failed,
    skipped: a.skipped + b.skipped,
    error: a.error + b.error,
    flaky: a.flaky + b.flaky,
  };
}

/** Pass rate over executed cases (skipped excluded); undefined when none ran. */
export function passRate(counts: CaseCounts): number | undefined {
  const ran = counts.total - counts.skipped;
  if (ran <= 0) return undefined;
  return (counts.passed / ran) * 100;
}

export function metric(covered: number, total: number): CoverageMetric {
  return {
    covered,
    total,
    pct: total > 0 ? (covered / total) * 100 : undefined,
  };
}

export function isTestKind(value: unknown): value is TestKind {
  return (
    typeof value === "string" &&
    (TEST_KINDS as readonly string[]).includes(value)
  );
}

export function isArtifactFormat(value: unknown): value is ArtifactFormat {
  return (
    typeof value === "string" &&
    (ARTIFACT_FORMATS as readonly string[]).includes(value)
  );
}

/** Stable id from a path-ish string: lowercase, non-word runs to `-`. */
export function slugId(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "x"
  );
}

export function round(value: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
