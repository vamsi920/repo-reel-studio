import { describe, expect, it } from "vitest";
import {
  detectFormat,
  parseArtifact,
  parseAutocannon,
  parseAxe,
  parseCobertura,
  parseGoTest,
  parseGreatExpectations,
  parseIstanbulSummary,
  parseJest,
  parseJunit,
  parseK6,
  parseLcov,
  parseNeotestChecks,
  parseNpmAudit,
  parsePytest,
  parseStryker,
} from "#/lib/testing/parsers";
import { parseXml } from "#/lib/testing/parsers/xml";

const JUNIT = `<?xml version="1.0"?>
<testsuites>
  <testsuite name="auth" tests="4" file="tests/auth.spec.ts">
    <testcase name="logs in" classname="auth" time="0.12"/>
    <testcase name="rejects bad password" classname="auth" time="0.05">
      <failure message="expected 401 &amp; got 200">AssertionError: expected 401
   at tests/auth.spec.ts:12</failure>
    </testcase>
    <testcase name="skipped one" classname="auth"><skipped message="todo"/></testcase>
    <testcase name="retried" classname="auth" time="1.0"><failure message="flake">boom</failure></testcase>
    <testcase name="retried" classname="auth" time="0.9"/>
  </testsuite>
</testsuites>`;

describe("xml reader", () => {
  it("parses attributes, entities, CDATA and self-closing tags", () => {
    const root = parseXml(
      `<a x="1 &amp; 2"><b/><c><![CDATA[<raw>]]></c><!-- c --></a>`,
    );
    expect(root?.name).toBe("a");
    expect(root?.attrs.x).toBe("1 & 2");
    expect(root?.children.map((c) => c.name)).toEqual(["b", "c"]);
    expect(root?.children[1].text).toBe("<raw>");
  });
});

describe("test-result parsers", () => {
  it("reads JUnit cases, failures, skips and marks retried cases flaky", () => {
    const { cases } = parseJunit(JUNIT);
    const byName = Object.fromEntries(cases.map((c) => [c.name, c]));
    expect(cases).toHaveLength(4);
    expect(byName["logs in"].status).toBe("passed");
    expect(byName["logs in"].durationMs).toBe(120);
    expect(byName["rejects bad password"].status).toBe("failed");
    expect(byName["rejects bad password"].message).toBe(
      "expected 401 & got 200",
    );
    expect(byName["rejects bad password"].file).toBe("tests/auth.spec.ts");
    expect(byName["skipped one"].status).toBe("skipped");
    expect(byName.retried.status).toBe("flaky");
    expect(byName.retried.retries).toBe(1);
  });

  it("reads Node's junit reporter, which puts top-level cases straight under <testsuites>", () => {
    const { cases } = parseJunit(
      `<?xml version="1.0" encoding="utf-8"?>\n<testsuites>\n\t<testcase name="adds" time="0.001" classname="test" file="/p/test/a.test.js"/>\n\t<testcase name="fails" time="0.002" classname="test"><failure type="testCodeFailure" message="boom">[Error: boom]</failure></testcase>\n\t<!-- tests 2 -->\n</testsuites>`,
    );
    expect(cases.map((c) => [c.name, c.status])).toEqual([
      ["adds", "passed"],
      ["fails", "failed"],
    ]);
    expect(cases[0].file).toBe("/p/test/a.test.js");
  });

  it("reads Jest/Vitest JSON including retried-then-green assertions", () => {
    const { cases } = parseJest({
      numTotalTests: 3,
      testResults: [
        {
          name: "/repo/src/a.test.ts",
          status: "failed",
          assertionResults: [
            { fullName: "a works", status: "passed", duration: 3 },
            {
              fullName: "a fails",
              status: "failed",
              failureMessages: ["Expected 1\nReceived 2"],
            },
            { fullName: "a retried", status: "passed", invocations: 2 },
            { fullName: "a todo", status: "todo" },
          ],
        },
      ],
    });
    expect(cases.map((c) => c.status)).toEqual([
      "passed",
      "failed",
      "flaky",
      "skipped",
    ]);
    expect(cases[1].message).toContain("Expected 1");
  });

  it("reads pytest-json-report outcomes", () => {
    const { cases } = parsePytest({
      tests: [
        {
          nodeid: "tests/test_x.py::test_ok",
          outcome: "passed",
          duration: 0.5,
        },
        {
          nodeid: "tests/test_x.py::TestA::test_bad",
          outcome: "failed",
          call: { longrepr: "assert 1 == 2" },
        },
        { nodeid: "tests/test_x.py::test_skip", outcome: "skipped" },
        {
          nodeid: "tests/test_x.py::test_err",
          outcome: "passed",
          setup: { outcome: "failed" },
        },
      ],
    });
    expect(cases.map((c) => c.status)).toEqual([
      "passed",
      "failed",
      "skipped",
      "error",
    ]);
    expect(cases[1].file).toBe("tests/test_x.py");
    expect(cases[1].suite).toBe("TestA");
    expect(cases[0].durationMs).toBe(500);
  });

  it("reads go test -json streams", () => {
    const text = [
      { Action: "run", Package: "p", Test: "TestA" },
      {
        Action: "output",
        Package: "p",
        Test: "TestA",
        Output: "--- FAIL: TestA\n",
      },
      {
        Action: "output",
        Package: "p",
        Test: "TestA",
        Output: "    want 2, got 3\n",
      },
      { Action: "fail", Package: "p", Test: "TestA", Elapsed: 0.02 },
      { Action: "pass", Package: "p", Test: "TestB", Elapsed: 0.01 },
      { Action: "skip", Package: "p", Test: "TestC", Elapsed: 0 },
    ]
      .map((e) => JSON.stringify(e))
      .join("\n");
    const { cases } = parseGoTest(text);
    expect(cases.map((c) => [c.name, c.status])).toEqual([
      ["TestA", "failed"],
      ["TestB", "passed"],
      ["TestC", "skipped"],
    ]);
    expect(cases[0].message).toContain("want 2, got 3");
  });
});

describe("coverage parsers", () => {
  it("sums lcov records and lists hotspots", () => {
    const lcov = `TN:\nSF:src/a.ts\nFNF:2\nFNH:1\nLF:10\nLH:5\nBRF:4\nBRH:1\nend_of_record\nSF:src/b.ts\nLF:10\nLH:10\nend_of_record\n`;
    const c = parseLcov(lcov);
    expect(c.lines).toEqual({ covered: 15, total: 20, pct: 75 });
    expect(c.branches?.pct).toBe(25);
    expect(c.functions?.pct).toBe(50);
    expect(c.hotspots).toEqual([
      { file: "src/a.ts", uncoveredLines: 5, pct: 50 },
    ]);
  });

  it("reads Cobertura line hits and condition coverage", () => {
    const xml = `<coverage line-rate="0.5"><packages><package><classes>
      <class filename="a.py"><lines><line number="1" hits="1"/><line number="2" hits="0" branch="true" condition-coverage="50% (1/2)"/></lines></class>
    </classes></package></packages></coverage>`;
    const c = parseCobertura(xml)!;
    expect(c.lines).toEqual({ covered: 1, total: 2, pct: 50 });
    expect(c.branches).toEqual({ covered: 1, total: 2, pct: 50 });
  });

  it("reads Istanbul coverage-summary.json", () => {
    const c = parseIstanbulSummary({
      total: {
        lines: { total: 100, covered: 80, pct: 80 },
        branches: { total: 10, covered: 5, pct: 50 },
      },
      "src/x.ts": { lines: { total: 100, covered: 80, pct: 80 } },
    });
    expect(c.lines.pct).toBe(80);
    expect(c.branches?.pct).toBe(50);
    expect(c.hotspots[0].file).toBe("src/x.ts");
  });
});

describe("quality parsers", () => {
  it("reads k6 summary percentiles, error rate and thresholds", () => {
    const [p] = parseK6({
      metrics: {
        http_req_duration: {
          values: { med: 20, "p(95)": 120, "p(99)": 300, max: 400 },
          thresholds: { "p(95)<500": { ok: true } },
        },
        http_reqs: { values: { count: 1000, rate: 50 } },
        http_req_failed: { values: { value: 0.02 } },
        vus_max: { values: { max: 10 } },
      },
    });
    expect(p.p95Ms).toBe(120);
    expect(p.errorRate).toBe(2);
    expect(p.requests).toBe(1000);
    expect(p.vus).toBe(10);
    expect(p.thresholds).toEqual([
      { expr: "http_req_duration: p(95)<500", passed: true },
    ]);
  });

  it("reads autocannon output", () => {
    const [p] = parseAutocannon({
      url: "http://localhost:3000/",
      latency: { p50: 5, p90: 9, p95: 11, p97_5: 12, p99: 20, max: 30 },
      requests: { total: 500, average: 100 },
      errors: 5,
      non2xx: 0,
      connections: 10,
      duration: 5,
    });
    expect(p.p95Ms).toBe(11);
    expect(p.errorRate).toBe(1);
    expect(p.rps).toBe(100);
  });

  it("reads axe violations with impact", () => {
    const v = parseAxe([
      {
        url: "http://x/",
        violations: [
          {
            id: "color-contrast",
            impact: "serious",
            help: "Contrast",
            nodes: [{}, {}],
          },
        ],
        passes: [],
      },
    ]);
    expect(v).toEqual([
      expect.objectContaining({
        rule: "color-contrast",
        impact: "serious",
        nodes: 2,
        page: "http://x/",
      }),
    ]);
  });

  it("reads npm audit vulnerabilities", () => {
    const f = parseNpmAudit({
      metadata: {},
      vulnerabilities: {
        lodash: {
          severity: "high",
          range: "<4.17.21",
          via: [{ title: "Prototype Pollution", url: "https://x" }],
          fixAvailable: true,
        },
      },
    });
    expect(f[0]).toEqual(
      expect.objectContaining({
        package: "lodash",
        severity: "high",
        title: "Prototype Pollution",
        fixedIn: "available",
      }),
    );
  });

  it("reads Neo Test checks.json and Great Expectations results", () => {
    const checks = parseNeotestChecks({
      checks: [
        {
          name: "orders.user_id references users",
          dataset: "orders",
          status: "pass",
          severity: "critical",
        },
        {
          name: "amount >= 0",
          dataset: "orders",
          column: "amount",
          status: "fail",
          unexpected_count: 3,
        },
      ],
    });
    expect(checks.map((c) => c.status)).toEqual(["pass", "fail"]);
    expect(checks[1].unexpectedCount).toBe(3);
    const ge = parseGreatExpectations({
      results: [
        {
          success: true,
          expectation_config: {
            expectation_type: "expect_column_values_to_be_unique",
            kwargs: { column: "id" },
          },
          result: {},
        },
        {
          success: false,
          expectation_config: {
            expectation_type: "expect_column_values_to_be_between",
            kwargs: { column: "age" },
          },
          result: { unexpected_count: 2, unexpected_percent: 1.5 },
        },
      ],
    });
    expect(ge[0].severity).toBe("critical");
    expect(ge[1]).toEqual(
      expect.objectContaining({
        status: "fail",
        column: "age",
        unexpectedCount: 2,
      }),
    );
  });

  it("reads a Stryker report into a score", () => {
    const m = parseStryker({
      schemaVersion: "1",
      files: {
        "src/a.ts": {
          mutants: [
            { status: "Killed" },
            {
              status: "Survived",
              mutatorName: "EqualityOperator",
              location: { start: { line: 4 } },
            },
            { status: "NoCoverage" },
            { status: "Timeout" },
          ],
        },
      },
    });
    expect(m).toEqual(
      expect.objectContaining({
        total: 4,
        killed: 1,
        survived: 1,
        timeout: 1,
        noCoverage: 1,
      }),
    );
    expect(m.score).toBeCloseTo(66.67, 1);
    expect(m.survivors[0]).toEqual({
      file: "src/a.ts",
      line: 4,
      mutator: "EqualityOperator",
      description: undefined,
    });
  });
});

describe("detection", () => {
  it("detects formats from content before falling back to the name", () => {
    expect(detectFormat("x.xml", JUNIT)).toBe("junit");
    expect(detectFormat("lcov.info", "TN:\nSF:a\nend_of_record\n")).toBe(
      "lcov",
    );
    expect(
      detectFormat(
        "out.json",
        JSON.stringify({ metrics: { http_req_duration: {} } }),
      ),
    ).toBe("k6");
    expect(
      detectFormat(
        "report.json",
        JSON.stringify({ checks: [{ name: "a", status: "pass" }] }),
      ),
    ).toBe("neotest_checks");
    expect(detectFormat("weird.txt", "hello")).toBeUndefined();
    expect(detectFormat("anything", "garbage", "junit")).toBe("junit");
  });

  it("never throws on a bad artifact: it warns", () => {
    const parsed = parseArtifact("results/junit.xml", "<not xml", "junit");
    expect(parsed.cases).toEqual([]);
    expect(parsed.warnings[0]).toMatch(/junit/);
    const unknown = parseArtifact("results/thing.bin", "\u0000\u0001");
    expect(unknown.warnings[0]).toMatch(/unrecognised/);
  });
});
