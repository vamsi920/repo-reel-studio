/**
 * Quality gates: declared before a run, evaluated by the studio after it.
 * A metric that was not measured is `not_measured`, never a pass.
 *
 * @spec NT-005 — Quality gates
 */
import type {
  GateMetric,
  GateReport,
  GateResult,
  GateRule,
  GateVerdict,
  TestReport,
} from "./model";
import { GATE_METRICS, passRate, round } from "./model";

export const DEFAULT_GATES: GateRule[] = [
  {
    id: "no-failures",
    metric: "failed_tests",
    op: "<=",
    threshold: 0,
    blocking: true,
  },
  {
    id: "line-coverage",
    metric: "line_coverage",
    op: ">=",
    threshold: 70,
    blocking: true,
  },
  {
    id: "coverage-not-down",
    metric: "coverage_delta",
    op: ">=",
    threshold: -1,
    blocking: false,
  },
  {
    id: "p95-budget",
    metric: "p95_ms",
    op: "<=",
    threshold: 500,
    blocking: true,
  },
  {
    id: "error-rate",
    metric: "error_rate",
    op: "<=",
    threshold: 1,
    blocking: true,
  },
  {
    id: "critical-data",
    metric: "critical_data_checks_failed",
    op: "<=",
    threshold: 0,
    blocking: true,
  },
  {
    id: "data-checks",
    metric: "data_checks_failed",
    op: "<=",
    threshold: 0,
    blocking: false,
  },
  {
    id: "security",
    metric: "security_critical_high",
    op: "<=",
    threshold: 0,
    blocking: true,
  },
  {
    id: "a11y",
    metric: "a11y_critical_serious",
    op: "<=",
    threshold: 0,
    blocking: true,
  },
  {
    id: "mutation",
    metric: "mutation_score",
    op: ">=",
    threshold: 60,
    blocking: false,
  },
  {
    id: "flaky",
    metric: "flaky_tests",
    op: "<=",
    threshold: 0,
    blocking: false,
  },
];

export const METRIC_LABELS: Record<GateMetric, string> = {
  failed_tests: "Failed tests",
  pass_rate: "Pass rate (%)",
  line_coverage: "Line coverage (%)",
  coverage_delta: "Coverage change vs previous (pts)",
  branch_coverage: "Branch coverage (%)",
  p95_ms: "p95 latency (ms)",
  p99_ms: "p99 latency (ms)",
  error_rate: "Request error rate (%)",
  critical_data_checks_failed: "Critical data checks failed",
  data_checks_failed: "Data checks failed",
  security_critical_high: "Critical/high security findings",
  security_total: "Security findings",
  a11y_critical_serious: "Critical/serious accessibility violations",
  a11y_total: "Accessibility violations",
  mutation_score: "Mutation score (%)",
  flaky_tests: "Flaky tests",
};

function hasKind(report: TestReport, kinds: string[]): boolean {
  return report.suites.some(
    (s) =>
      kinds.includes(s.kind) &&
      s.status !== "pending" &&
      s.status !== "skipped",
  );
}

/** Reads one metric from a report; undefined when it was not measured. */
export function readMetric(
  report: TestReport,
  metricId: GateMetric,
  scope?: string,
): number | undefined {
  const perf = scope
    ? report.perf.filter((p) => p.name === scope)
    : report.perf;
  switch (metricId) {
    case "failed_tests":
      return report.counts.failed + report.counts.error;
    case "pass_rate":
      return passRate(report.counts);
    case "line_coverage":
      return report.coverage?.lines.pct;
    case "branch_coverage":
      return report.coverage?.branches?.pct;
    case "coverage_delta":
      return report.trend?.lineCoverage;
    case "p95_ms":
      return perf.length
        ? Math.max(...perf.map((p) => p.p95Ms ?? 0))
        : undefined;
    case "p99_ms":
      return perf.length
        ? Math.max(...perf.map((p) => p.p99Ms ?? 0))
        : undefined;
    case "error_rate":
      return perf.some((p) => p.errorRate !== undefined)
        ? Math.max(...perf.map((p) => p.errorRate ?? 0))
        : undefined;
    case "critical_data_checks_failed":
      return hasKind(report, ["data"]) || report.checks.length
        ? report.checks.filter(
            (c) =>
              c.severity === "critical" &&
              (c.status === "fail" || c.status === "error"),
          ).length
        : undefined;
    case "data_checks_failed":
      return hasKind(report, ["data"]) || report.checks.length
        ? report.checks.filter(
            (c) => c.status === "fail" || c.status === "error",
          ).length
        : undefined;
    case "security_critical_high":
      return hasKind(report, ["security"]) || report.security.length
        ? report.security.filter(
            (f) => f.severity === "critical" || f.severity === "high",
          ).length
        : undefined;
    case "security_total":
      return hasKind(report, ["security"]) || report.security.length
        ? report.security.length
        : undefined;
    case "a11y_critical_serious":
      return hasKind(report, ["accessibility"]) || report.accessibility.length
        ? report.accessibility.filter(
            (v) => v.impact === "critical" || v.impact === "serious",
          ).length
        : undefined;
    case "a11y_total":
      return hasKind(report, ["accessibility"]) || report.accessibility.length
        ? report.accessibility.length
        : undefined;
    case "mutation_score":
      return report.mutation?.score;
    case "flaky_tests":
      return report.counts.flaky;
    default:
      return undefined;
  }
}

function compare(
  actual: number,
  op: GateRule["op"],
  threshold: number,
): boolean {
  if (op === "<=") return actual <= threshold;
  if (op === ">=") return actual >= threshold;
  return actual === threshold;
}

export function evaluateRule(report: TestReport, rule: GateRule): GateResult {
  const actual = readMetric(report, rule.metric, rule.scope);
  if (actual === undefined) {
    // A metric no tool reported (coverage, latency, a kind that never ran)
    // is unknown, not zero: the gate is neither passed nor failed.
    return {
      rule,
      verdict: "not_measured",
      detail: "not measured in this run",
    };
  }
  const ok = compare(actual, rule.op, rule.threshold);
  const verdict: GateVerdict = ok
    ? "passed"
    : rule.blocking
      ? "failed"
      : "warned";
  return {
    rule,
    actual: round(actual, 2),
    verdict,
    detail: ok
      ? undefined
      : `${METRIC_LABELS[rule.metric]} ${round(actual, 2)} ${rule.op === "<=" ? "exceeds" : "below"} ${rule.threshold}`,
  };
}

export function evaluateGates(
  report: TestReport,
  rules: GateRule[],
): GateReport {
  const results = rules.map((rule) => evaluateRule(report, rule));
  let verdict: GateVerdict = "passed";
  if (results.some((r) => r.verdict === "failed")) verdict = "failed";
  else if (results.some((r) => r.verdict === "warned")) verdict = "warned";
  else if (
    results.length === 0 ||
    results.every((r) => r.verdict === "not_measured")
  )
    verdict = "not_measured";
  return { verdict, results };
}

/** Validates agent/user-supplied rules; drops the invalid ones with a reason. */
export function normalizeGates(raw: unknown): {
  rules: GateRule[];
  rejected: string[];
} {
  const rules: GateRule[] = [];
  const rejected: string[] = [];
  if (!Array.isArray(raw))
    return { rules, rejected: ["gates must be an array"] };
  raw.forEach((item, i) => {
    if (!item || typeof item !== "object") {
      rejected.push(`#${i}: not an object`);
      return;
    }
    const r = item as Record<string, unknown>;
    const metricId =
      typeof r.metric === "string" ? (r.metric as GateMetric) : undefined;
    if (!metricId || !(GATE_METRICS as readonly string[]).includes(metricId)) {
      rejected.push(`#${i}: unknown metric ${String(r.metric)}`);
      return;
    }
    const threshold =
      typeof r.threshold === "number" && Number.isFinite(r.threshold)
        ? r.threshold
        : undefined;
    if (threshold === undefined) {
      rejected.push(`#${i}: threshold must be a number`);
      return;
    }
    const op =
      r.op === "<=" || r.op === ">=" || r.op === "=="
        ? r.op
        : defaultOp(metricId);
    rules.push({
      id:
        typeof r.id === "string" && r.id.trim()
          ? r.id.trim()
          : `${metricId}-${i}`,
      metric: metricId,
      op,
      threshold,
      blocking: r.blocking !== false,
      scope:
        typeof r.scope === "string" && r.scope.trim()
          ? r.scope.trim()
          : undefined,
    });
  });
  return { rules, rejected };
}

export function defaultOp(metricId: GateMetric): GateRule["op"] {
  return [
    "pass_rate",
    "line_coverage",
    "branch_coverage",
    "coverage_delta",
    "mutation_score",
  ].includes(metricId)
    ? ">="
    : "<=";
}
