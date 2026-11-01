import { describe, expect, it } from "vitest";
import {
  detectFormat,
  parseArtifact,
  parseBackstop,
  parseBombardier,
  parseCargoAudit,
  parseCargoMutants,
  parseCtrf,
  parseGitleaks,
  parseGovulncheck,
  parseLighthouse,
  parseNuclei,
  parseOha,
  parseOsvScanner,
  parsePa11y,
  parseVegeta,
} from "#/lib/testing/parsers";
import { toCtrf } from "#/lib/testing/ctrf";
import { TOOL_CATALOG, catalogByKind, catalogFor } from "#/lib/testing/catalog";
import { TEST_KINDS, type TestReport } from "#/lib/testing/model";

describe("load-test parsers", () => {
  it("reads oha (seconds) into milliseconds with an error rate from status codes", () => {
    const [p] = parseOha({
      summary: {
        successRate: 0.98,
        total: 10.02,
        requestsPerSec: 998.4,
        slowest: 0.42,
      },
      latencyPercentiles: { p50: 0.004, p90: 0.009, p95: 0.012, p99: 0.03 },
      statusCodeDistribution: { "200": 9800, "500": 200 },
    });
    expect(p.p95Ms).toBeCloseTo(12);
    expect(p.requests).toBe(10000);
    expect(p.errorRate).toBe(2);
    expect(p.rps).toBeCloseTo(998.4);
  });

  it("reads vegeta (nanoseconds) and bombardier (microseconds)", () => {
    const [v] = parseVegeta({
      latencies: {
        "50th": 4_000_000,
        "95th": 12_000_000,
        "99th": 30_000_000,
        max: 90_000_000,
      },
      requests: 3000,
      rate: 50,
      throughput: 49.5,
      success: 0.99,
      duration: 60_000_000_000,
    });
    expect(v.p95Ms).toBe(12);
    expect(v.errorRate).toBeCloseTo(1);
    const [b] = parseBombardier({
      spec: { url: "http://x/", numberOfConnections: 25 },
      result: {
        req1xx: 0,
        req2xx: 1000,
        req3xx: 0,
        req4xx: 10,
        req5xx: 0,
        others: 0,
        latency: {
          max: 50000,
          percentiles: { "50": 3000, "95": 9000, "99": 20000 },
        },
        rps: { mean: 500 },
        timeTakenSeconds: 2,
      },
    });
    expect(b.p95Ms).toBe(9);
    expect(b.errorRate).toBeCloseTo(0.99, 1);
    expect(b.vus).toBe(25);
  });
});

describe("accessibility parsers", () => {
  it("reads Lighthouse failed accessibility audits and the performance score", () => {
    const { accessibility, perf } = parseLighthouse({
      lighthouseVersion: "12",
      finalDisplayedUrl: "http://x/",
      categories: {
        accessibility: {
          score: 0.8,
          auditRefs: [
            { id: "image-alt", weight: 10 },
            { id: "label", weight: 7 },
            { id: "ok", weight: 3 },
          ],
        },
        performance: { score: 0.95 },
      },
      audits: {
        "image-alt": {
          score: 0,
          title: "Image elements have [alt]",
          details: { items: [{}, {}] },
        },
        label: {
          score: 0,
          title: "Form elements have labels",
          details: { items: [{}] },
        },
        ok: { score: 1 },
        "largest-contentful-paint": { numericValue: 1200 },
        interactive: { numericValue: 1800 },
      },
    });
    expect(accessibility.map((v) => [v.rule, v.impact, v.nodes])).toEqual([
      ["image-alt", "critical", 2],
      ["label", "serious", 1],
    ]);
    expect(perf[0].p95Ms).toBe(1800);
    expect(perf[0].thresholds[0].passed).toBe(true);
  });

  it("groups pa11y issues by code", () => {
    const v = parsePa11y([
      {
        code: "WCAG2AA.Principle1.Guideline1_1.1_1_1.H37",
        type: "error",
        message: "Img missing alt",
        selector: "img",
      },
      {
        code: "WCAG2AA.Principle1.Guideline1_1.1_1_1.H37",
        type: "error",
        message: "Img missing alt",
        selector: "img:nth-child(2)",
      },
      { code: "X", type: "warning", message: "w", selector: "p" },
    ]);
    expect(v).toHaveLength(2);
    expect(v[0]).toEqual(
      expect.objectContaining({ impact: "serious", nodes: 2 }),
    );
    expect(v[1].impact).toBe("moderate");
  });
});

describe("security parsers", () => {
  it("reads gitleaks, nuclei, cargo-audit, govulncheck and osv-scanner", () => {
    expect(
      parseGitleaks([
        {
          RuleID: "aws-access-token",
          Description: "AWS token",
          File: "config/prod.env",
          StartLine: 3,
        },
      ])[0],
    ).toEqual(
      expect.objectContaining({
        severity: "high",
        file: "config/prod.env",
        line: 3,
        tool: "gitleaks",
      }),
    );
    const nuclei = parseNuclei(
      `{"template-id":"exposed-env","info":{"name":"Exposed .env","severity":"high"},"matched-at":"http://x/.env"}\n{"template-id":"cors","info":{"name":"CORS","severity":"info"},"matched-at":"http://x/"}\n`,
    );
    expect(nuclei.map((f) => f.severity)).toEqual(["high", "info"]);
    const cargo = parseCargoAudit({
      lockfile: {},
      vulnerabilities: {
        list: [
          {
            advisory: { id: "RUSTSEC-1", title: "bad", cvss: "9" },
            package: { name: "foo", version: "1.0" },
            versions: { patched: [">=1.1"] },
          },
        ],
      },
    });
    expect(cargo[0]).toEqual(
      expect.objectContaining({
        package: "foo",
        fixedIn: ">=1.1",
        severity: "high",
      }),
    );
    const govuln = parseGovulncheck(
      `{"osv":{"id":"GO-2024-1","summary":"bad mod"}}\n{"finding":{"osv":"GO-2024-1","fixed_version":"v1.2.3","trace":[{"module":"example.com/mod","version":"v1.0.0"}]}}\n`,
    );
    expect(govuln[0]).toEqual(
      expect.objectContaining({
        package: "example.com/mod",
        fixedIn: "v1.2.3",
        title: "GO-2024-1: bad mod",
      }),
    );
    const osv = parseOsvScanner({
      results: [
        {
          source: { path: "package-lock.json" },
          packages: [
            {
              package: { name: "lodash", version: "4.17.0" },
              vulnerabilities: [
                {
                  id: "GHSA-x",
                  summary: "proto pollution",
                  database_specific: { severity: "HIGH" },
                },
              ],
            },
          ],
        },
      ],
    });
    expect(osv[0]).toEqual(
      expect.objectContaining({
        package: "lodash",
        severity: "high",
        file: "package-lock.json",
      }),
    );
  });
});

describe("mutation, visual and CTRF parsers", () => {
  it("reads cargo-mutants outcomes into a score with survivors", () => {
    const m = parseCargoMutants({
      total_mutants: 3,
      caught: 2,
      missed: 1,
      timeout: 0,
      unviable: 0,
      outcomes: [
        { summary: "CaughtMutant" },
        { summary: "CaughtMutant" },
        {
          summary: "MissedMutant",
          scenario: {
            Mutant: {
              file: "src/lib.rs",
              function: "add",
              replacement: "0",
              span: { start: { line: 12 } },
            },
          },
        },
      ],
    });
    expect(m.score).toBeCloseTo(66.67, 1);
    expect(m.survivors[0]).toEqual({
      file: "src/lib.rs",
      line: 12,
      mutator: "→ 0",
      description: "in add",
    });
  });

  it("turns BackstopJS pairs into visual test cases", () => {
    const cases = parseBackstop({
      tests: [
        { status: "pass", pair: { label: "home", viewportLabel: "phone" } },
        {
          status: "fail",
          pair: {
            label: "home",
            viewportLabel: "desktop",
            diff: { misMatchPercentage: "2.31" },
            diffImage: "diff.png",
          },
        },
      ],
    });
    expect(cases.map((c) => c.status)).toEqual(["passed", "failed"]);
    expect(cases[1].message).toContain("2.31% mismatch");
  });

  it("reads CTRF and round-trips a report into CTRF", () => {
    const { cases } = parseCtrf({
      results: {
        tool: { name: "vitest" },
        summary: {
          tests: 3,
          passed: 2,
          failed: 1,
          skipped: 0,
          pending: 0,
          other: 0,
          start: 0,
          stop: 1,
        },
        tests: [
          { name: "a", status: "passed", duration: 5 },
          {
            name: "b",
            status: "failed",
            duration: 7,
            message: "boom",
            filePath: "t.ts",
          },
          { name: "c", status: "passed", duration: 1, retries: 2 },
        ],
      },
    });
    expect(cases.map((c) => c.status)).toEqual(["passed", "failed", "flaky"]);
    const report = {
      runId: "r",
      startedAt: "2026-11-01T10:00:00Z",
      finishedAt: "2026-11-01T10:01:00Z",
      commit: "abc",
      perf: [],
      security: [],
      accessibility: [],
      checks: [],
      gates: { verdict: "failed", results: [] },
      suites: [{ kind: "unit", name: "Unit", cases: cases }],
    } as unknown as TestReport;
    const ctrf = toCtrf(report, "shop");
    expect(ctrf.results.summary).toEqual(
      expect.objectContaining({ tests: 3, passed: 2, failed: 1 }),
    );
    expect(ctrf.results.tests[2].flaky).toBe(true);
    expect(ctrf.results.extra?.gate).toBe("failed");
    expect(ctrf.results.environment?.appName).toBe("shop");
  });

  it("detects the new formats by content and by name", () => {
    expect(
      detectFormat(
        "x.json",
        JSON.stringify({
          results: { tool: { name: "x" }, summary: {}, tests: [] },
        }),
      ),
    ).toBe("ctrf");
    expect(
      detectFormat(
        "x.json",
        JSON.stringify({
          summary: { requestsPerSec: 1 },
          latencyPercentiles: {},
        }),
      ),
    ).toBe("oha");
    expect(
      detectFormat("x.json", JSON.stringify([{ RuleID: "a", File: "b" }])),
    ).toBe("gitleaks");
    expect(detectFormat("outcomes.json", "{}")).toBe("cargo_mutants");
    expect(
      detectFormat("nuclei.jsonl", `{"template-id":"a","matched-at":"b"}`),
    ).toBe("nuclei");
    // gitleaks with no findings writes an empty array: zero findings, no warning.
    const empty = parseArtifact("r/gitleaks.json", "[]", "gitleaks");
    expect(empty.security).toEqual([]);
    expect(empty.warnings).toEqual([]);
  });
});

describe("tool catalog", () => {
  it("has a MIT option for every kind and filters by language", () => {
    const byKind = catalogByKind(["javascript/typescript"]);
    for (const kind of TEST_KINDS) {
      expect(byKind[kind]?.length, kind).toBeGreaterThan(0);
      expect(byKind[kind][0].mit, `${kind} first entry MIT`).toBe(true);
    }
    expect(catalogFor(["python"]).some((t) => t.id === "pytest")).toBe(true);
    expect(catalogFor(["python"]).some((t) => t.id === "vitest")).toBe(false);
    expect(catalogFor(["rust"], { mitOnly: true }).every((t) => t.mit)).toBe(
      true,
    );
    // Every tool that writes a file names a format the parsers know.
    for (const tool of TOOL_CATALOG) {
      if (tool.result) expect(typeof tool.result.format).toBe("string");
    }
  });
});
