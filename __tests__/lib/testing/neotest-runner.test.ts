// @vitest-environment node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// The harness Neo Test installs into project workspaces.
import {
  expandResultPath,
  generateMutants,
  mutateAndRun as mutateAndRunUntyped,
  parseArgs,
  runPlan as runPlanUntyped,
} from "#/lib/testing/neotest-runner.mjs";
import { parseArtifact, parseNeotestMutation } from "#/lib/testing/parsers";
import type { HarnessMutation, HarnessStatus } from "#/lib/testing/model";

// The harness is plain JS; give its two entry points the shapes the studio
// reads back (status.json / mutation.json) so the assertions typecheck.
const runPlan = runPlanUntyped as unknown as (options: {
  plan: unknown;
  runId: string;
  suites?: string[];
  root: string;
  log?: (line: string) => void;
}) => Promise<HarnessStatus>;
const mutateAndRun = mutateAndRunUntyped as unknown as (options: {
  plan: unknown;
  runId: string;
  file: string;
  suiteId: string;
  root: string;
}) => Promise<HarnessMutation>;

/** A tiny project: one source file and a hand-rolled JUnit-writing test. */
function project() {
  const root = mkdtempSync(join(tmpdir(), "neotest-"));
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, ".neotest"), { recursive: true });
  writeFileSync(
    join(root, "src/math.mjs"),
    `export function clamp(v, lo, hi) {\n  if (v < lo) return lo;\n  if (v > hi) return hi;\n  return v;\n}\n`,
  );
  writeFileSync(
    join(root, "test.mjs"),
    `import { clamp } from "./src/math.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
let fails = 0;
const tc = (n, ok) => { if (!ok) fails++; return '<testcase name="' + n + '" classname="math" time="0.01">' + (ok ? "" : '<failure message="bad">bad</failure>') + '</testcase>'; };
const cases = [tc("low", clamp(-1, 0, 10) === 0), tc("high", clamp(11, 0, 10) === 10), tc("mid", clamp(5, 0, 10) === 5)];
mkdirSync(".neotest/results", { recursive: true });
writeFileSync(".neotest/results/junit.xml", '<testsuites><testsuite name="math" tests="3">' + cases.join("") + '</testsuite></testsuites>');
process.exit(fails ? 1 : 0);
`,
  );
  const plan = {
    suites: [
      {
        id: "unit",
        kind: "unit",
        name: "node unit",
        command: "node test.mjs",
        results: [{ path: ".neotest/results/junit.xml", format: "junit" }],
      },
      {
        id: "slow",
        kind: "integration",
        name: "times out",
        command: "sleep 5",
        timeoutSec: 1,
        results: [],
      },
      {
        id: "glob",
        kind: "api",
        name: "glob results",
        command:
          'mkdir -p out && echo \'<testsuites><testsuite name="g"><testcase name="a" classname="g"/></testsuite></testsuites>\' > out/TEST-one.xml',
        results: [{ path: "out/TEST-*.xml", format: "junit" }],
      },
    ],
  };
  writeFileSync(join(root, ".neotest/plan.json"), JSON.stringify(plan));
  return { root, plan };
}

describe("neotest harness", () => {
  it("runs every suite in order, kills a timed-out suite, copies declared artifacts (globs included) and writes status.json progressively", async () => {
    const { root, plan } = project();
    const log: string[] = [];
    const status = await runPlan({
      plan,
      runId: "r1",
      root,
      log: (l: string) => {
        log.push(l);
      },
    });
    expect(status.finishedAt).toBeTruthy();
    const byId = Object.fromEntries(status.suites.map((s) => [s.id, s]));
    expect(byId.unit.status).toBe("passed");
    expect(byId.unit.exitCode).toBe(0);
    expect(byId.unit.artifacts[0].path).toBe(
      ".neotest/runs/r1/artifacts/unit/junit.xml",
    );
    expect(byId.slow.status).toBe("timeout");
    expect(byId.slow.durationMs).toBeLessThan(3000);
    expect(byId.glob.artifacts[0].path).toBe(
      ".neotest/runs/r1/artifacts/glob/TEST-one.xml",
    );
    const onDisk = JSON.parse(
      readFileSync(join(root, ".neotest/runs/r1/status.json"), "utf8"),
    );
    expect(onDisk.suites).toHaveLength(3);
    expect(onDisk.node).toBe(process.version);
    // What the studio will parse from the copied artifact.
    const parsed = parseArtifact(
      byId.unit.artifacts[0].path,
      readFileSync(join(root, byId.unit.artifacts[0].path), "utf8"),
      "junit",
    );
    expect(parsed.cases?.map((c) => c.status)).toEqual([
      "passed",
      "passed",
      "passed",
    ]);
    expect(log.some((l) => l.includes("timeout"))).toBe(true);
  });

  it("runs only the named suites", async () => {
    const { root, plan } = project();
    const status = await runPlan({ plan, runId: "r2", suites: ["unit"], root });
    expect(status.suites.map((s) => s.id)).toEqual(["unit"]);
  });

  it("mutates one file at a time, restores it, and records which mutants the suite killed", async () => {
    const { root, plan } = project();
    const before = readFileSync(join(root, "src/math.mjs"), "utf8");
    const record = await mutateAndRun({
      plan,
      runId: "r3",
      file: "src/math.mjs",
      suiteId: "unit",
      root,
    });
    expect(readFileSync(join(root, "src/math.mjs"), "utf8")).toBe(before);
    expect(record.mutants.length).toBeGreaterThanOrEqual(2);
    expect(record.mutants.every((m) => m.killed)).toBe(true);
    expect(existsSync(join(root, ".neotest/runs/r3/mutation.json"))).toBe(true);
    const summary = parseNeotestMutation(record);
    expect(summary.score).toBe(100);
    expect(summary.survived).toBe(0);
  });

  it("generates deterministic operator mutants on distinct lines, skipping comments and imports", () => {
    const mutants = generateMutants(
      `import x from "y";\n// a < b\nif (a === b && c > d) {\n  return true;\n}\n`,
      10,
    );
    expect(
      mutants.map((m: { line: number; from: string; to: string }) => [
        m.line,
        m.from,
        m.to,
      ]),
    ).toEqual([
      [3, "===", "!=="],
      [4, "return true", "return false"],
    ]);
  });

  it("parses CLI arguments and expands simple result globs", () => {
    const args = parseArgs([
      "--plan",
      "p.json",
      "--run",
      "x",
      "--suites",
      "a, b",
      "--mutate",
      "f.js",
      "--suite",
      "a",
      "--max-mutants",
      "3",
    ]);
    expect(args).toEqual(
      expect.objectContaining({
        plan: "p.json",
        run: "x",
        suites: ["a", "b"],
        mutate: "f.js",
        suite: "a",
        maxMutants: 3,
      }),
    );
    expect(parseArgs([]).run).toMatch(/^run-/);
    const { root } = project();
    mkdirSync(join(root, "reports"));
    writeFileSync(join(root, "reports/TEST-a.xml"), "");
    writeFileSync(join(root, "reports/TEST-b.xml"), "");
    writeFileSync(join(root, "reports/other.txt"), "");
    expect(expandResultPath(root, "reports/TEST-*.xml").sort()).toEqual([
      "reports/TEST-a.xml",
      "reports/TEST-b.xml",
    ]);
    expect(expandResultPath(root, "reports/none-*.xml")).toEqual([]);
  });
});
