import { describe, expect, it } from "vitest";
import {
  buildReport,
  flakyAcrossRuns,
  reportHeadline,
  reportMarkdown,
} from "#/lib/testing/report";
import {
  DEFAULT_GATES,
  evaluateGates,
  normalizeGates,
  readMetric,
} from "#/lib/testing/gates";
import { detectStack } from "#/lib/testing/stack";
import type {
  HarnessStatus,
  ParsedArtifact,
  SuitePlan,
  TestReport,
} from "#/lib/testing/model";
import { countCases, passRate } from "#/lib/testing/model";

const plan: SuitePlan[] = [
  {
    id: "unit",
    kind: "unit",
    name: "Vitest",
    command: "npx vitest",
    results: [{ path: "r/junit.xml", format: "junit" }],
    origin: "existing",
  },
  {
    id: "perf",
    kind: "performance",
    name: "k6",
    command: "k6 run",
    results: [{ path: "r/k6.json", format: "k6" }],
    origin: "agent",
  },
  {
    id: "data",
    kind: "data",
    name: "checks",
    command: "node checks.mjs",
    results: [{ path: "r/checks.json", format: "neotest_checks" }],
    origin: "agent",
  },
  {
    id: "a11y",
    kind: "accessibility",
    name: "axe",
    command: "axe",
    results: [],
    origin: "agent",
    notApplicable: "CLI tool",
  },
];

function status(
  overrides: Partial<
    Record<string, Partial<HarnessStatus["suites"][number]>>
  > = {},
): HarnessStatus {
  return {
    version: 1,
    runId: "run-1",
    startedAt: "2026-10-30T10:00:00Z",
    finishedAt: "2026-10-30T10:05:00Z",
    commit: "abcdef1234567890",
    suites: ["unit", "perf", "data"].map((id) => ({
      id,
      status: "passed" as const,
      exitCode: 0,
      durationMs: 1000,
      artifacts: [],
      ...overrides[id],
    })),
  };
}

const unitArtifacts = (statuses: ("passed" | "failed")[]): ParsedArtifact[] => [
  {
    path: "r/junit.xml",
    format: "junit",
    warnings: [],
    cases: statuses.map((s, i) => ({
      id: `t${i}`,
      name: `test ${i}`,
      status: s,
    })),
    coverage: {
      lines: { covered: 80, total: 100, pct: 80 },
      hotspots: [],
      source: "lcov",
    },
  },
];

function build(
  opts: {
    unit?: ("passed" | "failed")[];
    p95?: number;
    checksFail?: boolean;
    previous?: TestReport;
    executed?: string[];
  } = {},
) {
  return buildReport({
    runId: "run-1",
    projectId: "p",
    plan,
    executed: opts.executed ?? ["unit", "perf", "data"],
    status: status(),
    artifactsBySuite: {
      unit: unitArtifacts(opts.unit ?? ["passed", "passed", "passed"]),
      perf: [
        {
          path: "r/k6.json",
          format: "k6",
          warnings: [],
          perf: [
            {
              name: "k6",
              requests: 100,
              p95Ms: opts.p95 ?? 200,
              errorRate: 0.5,
              thresholds: [],
              source: "k6",
            },
          ],
        },
      ],
      data: [
        {
          path: "r/checks.json",
          format: "neotest_checks",
          warnings: [],
          checks: [
            {
              id: "c1",
              name: "fk",
              status: opts.checksFail ? "fail" : "pass",
              severity: "critical",
            },
          ],
        },
      ],
    },
    gates: DEFAULT_GATES,
    previous: opts.previous,
    trigger: "agent",
    startedAt: "2026-10-30T10:00:00Z",
    finishedAt: "2026-10-30T10:05:00Z",
  });
}

describe("buildReport", () => {
  it("aggregates suites, counts, coverage, perf and checks and passes the default gates", () => {
    const report = build();
    expect(report.suites).toHaveLength(3);
    expect(report.counts).toEqual({
      total: 3,
      passed: 3,
      failed: 0,
      skipped: 0,
      error: 0,
      flaky: 0,
    });
    expect(report.coverage?.lines.pct).toBe(80);
    expect(report.perf[0].p95Ms).toBe(200);
    expect(report.checks).toHaveLength(1);
    expect(report.gates.verdict).toBe("passed");
    expect(report.kindsNotRun).toEqual([]);
    expect(reportHeadline(report)).toContain("PASSED");
  });

  it("fails the gate on a failed test even when the runner exited 0, and marks exit-code-only suites", () => {
    const report = buildReport({
      runId: "r",
      projectId: "p",
      plan,
      executed: ["unit", "perf"],
      status: status({
        perf: {
          artifacts: [
            { path: "r/k6.json", format: "k6", bytes: 0, missing: true },
          ],
        },
      }),
      artifactsBySuite: { unit: unitArtifacts(["passed", "failed"]), perf: [] },
      gates: DEFAULT_GATES,
      trigger: "user",
      startedAt: "a",
      finishedAt: "b",
    });
    expect(report.suites[0].status).toBe("failed");
    expect(report.suites[1].exitCodeOnly).toBe(true);
    expect(report.suites[1].warnings[0]).toMatch(/not produced/);
    expect(report.gates.verdict).toBe("failed");
    expect(
      report.gates.results.find((r) => r.rule.id === "no-failures")?.actual,
    ).toBe(1);
    expect(report.kindsNotRun).toEqual(["data"]);
  });

  it("fails on a p95 over budget and on a critical data check", () => {
    expect(
      build({ p95: 900 }).gates.results.find((r) => r.rule.id === "p95-budget")
        ?.verdict,
    ).toBe("failed");
    expect(
      build({ checksFail: true }).gates.results.find(
        (r) => r.rule.id === "critical-data",
      )?.verdict,
    ).toBe("failed");
  });

  it("reports unmeasured metrics as not_measured, never passed", () => {
    const report = buildReport({
      runId: "r",
      projectId: "p",
      plan: [plan[0]],
      executed: ["unit"],
      status: status(),
      artifactsBySuite: {
        unit: [
          {
            path: "r/junit.xml",
            format: "junit",
            warnings: [],
            cases: [{ id: "a", name: "a", status: "passed" }],
          },
        ],
      },
      gates: DEFAULT_GATES,
      trigger: "agent",
      startedAt: "a",
      finishedAt: "b",
    });
    const byId = Object.fromEntries(
      report.gates.results.map((r) => [r.rule.id, r.verdict]),
    );
    expect(byId["line-coverage"]).toBe("not_measured");
    expect(byId["p95-budget"]).toBe("not_measured");
    expect(byId["mutation"]).toBe("not_measured");
    expect(byId["no-failures"]).toBe("passed");
    // Counting gates whose kind never ran are not measured either.
    expect(byId.security).toBe("not_measured");
  });

  it("computes the trend against the previous run and flags flips on the same commit as flaky", () => {
    const previous = build({ unit: ["passed", "failed", "passed"] });
    const current = build({
      unit: ["passed", "passed", "passed"],
      p95: 250,
      previous,
    });
    expect(current.trend?.passRate).toBeCloseTo(33.33, 1);
    expect(current.trend?.p95Ms).toBe(50);
    expect(current.trend?.lineCoverage).toBe(0);
    // t1 failed before and passed now on the same commit: flaky.
    expect(current.flaky.map((c) => c.id)).toEqual(["t1"]);
    expect(current.counts.flaky).toBe(1);
    expect(
      current.gates.results.find((r) => r.rule.id === "flaky")?.verdict,
    ).toBe("warned");
    expect(current.gates.verdict).toBe("warned");
  });

  it("does not call a flip flaky when the working tree changed, even on the same commit", () => {
    const previous = { ...build({ unit: ["failed"] }), treeHash: "tree-a" };
    const current = { ...build({ unit: ["passed"] }), treeHash: "tree-b" };
    expect(flakyAcrossRuns(current, previous)).toEqual([]);
    const sameTree = { ...build({ unit: ["passed"] }), treeHash: "tree-a" };
    expect(flakyAcrossRuns(sameTree, previous).map((c) => c.id)).toEqual([
      "t0",
    ]);
  });

  it("does not call a flip flaky across different commits", () => {
    const previous = { ...build({ unit: ["failed"] }), commit: "other" };
    const current = build({ unit: ["passed"] });
    expect(flakyAcrossRuns(current, previous)).toEqual([]);
  });

  it("renders Markdown with the verdict, the gate list and every section that has data", () => {
    const md = reportMarkdown(
      build({ unit: ["passed", "failed"], checksFail: true }),
      "shop",
    );
    expect(md).toContain("# Test report — shop");
    expect(md).toContain("## Quality gate: FAILED");
    expect(md).toContain("## Failures");
    expect(md).toContain("## Performance");
    expect(md).toContain("## Data checks");
    expect(md).toContain("Numbers come from the runner artifacts");
  });
});

describe("gates", () => {
  it("normalises agent-supplied rules and rejects bad ones with a reason", () => {
    const { rules, rejected } = normalizeGates([
      { metric: "p95_ms", threshold: 300 },
      { metric: "line_coverage", threshold: 85, blocking: false, id: "cov" },
      { metric: "bogus", threshold: 1 },
      { metric: "error_rate" },
    ]);
    expect(rules).toEqual([
      {
        id: "p95_ms-0",
        metric: "p95_ms",
        op: "<=",
        threshold: 300,
        blocking: true,
        scope: undefined,
      },
      {
        id: "cov",
        metric: "line_coverage",
        op: ">=",
        threshold: 85,
        blocking: false,
        scope: undefined,
      },
    ]);
    expect(rejected).toHaveLength(2);
  });

  it("scopes a latency rule to one scenario", () => {
    const report = build();
    report.perf.push({
      name: "checkout",
      requests: 10,
      p95Ms: 900,
      thresholds: [],
      source: "k6",
    });
    expect(readMetric(report, "p95_ms")).toBe(900);
    expect(readMetric(report, "p95_ms", "k6")).toBe(200);
    const gates = evaluateGates(report, [
      {
        id: "k6-only",
        metric: "p95_ms",
        op: "<=",
        threshold: 500,
        blocking: true,
        scope: "k6",
      },
    ]);
    expect(gates.verdict).toBe("passed");
  });
});

describe("model helpers", () => {
  it("counts cases and excludes skipped from the pass rate", () => {
    const counts = countCases([
      { id: "a", name: "a", status: "passed" },
      { id: "b", name: "b", status: "skipped" },
      { id: "c", name: "c", status: "failed" },
    ]);
    expect(counts.total).toBe(3);
    expect(passRate(counts)).toBe(50);
    expect(
      passRate({
        total: 1,
        passed: 0,
        failed: 0,
        skipped: 1,
        error: 0,
        flaky: 0,
      }),
    ).toBeUndefined();
  });
});

describe("detectStack", () => {
  it("suggests suites from manifests and dependencies", () => {
    const hint = detectStack(
      [
        "package.json",
        "vitest.config.ts",
        "playwright.config.ts",
        ".github/workflows/ci.yml",
        "pyproject.toml",
        "go.mod",
      ],
      {
        devDependencies: { vitest: "1", "@playwright/test": "1" },
        dependencies: { express: "4" },
      },
    );
    expect(hint.languages).toEqual(["javascript/typescript", "python", "go"]);
    expect(hint.runners).toEqual(
      expect.arrayContaining(["vitest", "playwright", "pytest", "go test"]),
    );
    expect(hint.frameworks).toContain("express");
    expect(hint.ci).toEqual([".github/workflows/ci.yml"]);
    const kinds = hint.suggestions.map((s) => s.kind);
    expect(kinds).toEqual(expect.arrayContaining(["unit", "e2e", "security"]));
    expect(
      hint.suggestions.find((s) => s.name.startsWith("Vitest"))?.results[0]
        .format,
    ).toBe("junit");
  });
});
