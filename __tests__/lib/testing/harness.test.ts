import { describe, expect, it, vi } from "vitest";
import {
  harnessCommand,
  installHarness,
  mutationCommand,
  planFile,
  startRun,
  waitForStatus,
  writeReportFiles,
} from "#/lib/testing/harness";
import type { RunInWorkspace } from "#/lib/modernization/replay-harness";
import type { HarnessStatus, SuitePlan, TestReport } from "#/lib/testing/model";

const suites: SuitePlan[] = [
  {
    id: "unit",
    kind: "unit",
    name: "Unit",
    command: "npm test",
    results: [{ path: "r.xml", format: "junit" }],
    origin: "existing",
    timeoutSec: 60,
  },
  {
    id: "skip",
    kind: "e2e",
    name: "E2E",
    command: "",
    results: [],
    origin: "agent",
    notApplicable: "no UI",
  },
];

describe("harness glue", () => {
  it("serialises only applicable suites into the plan file", () => {
    const plan = JSON.parse(planFile(suites));
    expect(plan.suites).toHaveLength(1);
    expect(plan.suites[0]).toEqual(
      expect.objectContaining({
        id: "unit",
        command: "npm test",
        timeoutSec: 60,
      }),
    );
  });

  it("builds the harness commands the brief documents", () => {
    expect(harnessCommand("run-1", ["unit", "api"])).toBe(
      "node .neotest/run.mjs --plan .neotest/plan.json --run run-1 --suites unit,api",
    );
    expect(harnessCommand("run-1")).not.toContain("--suites");
    expect(mutationCommand("p-1", "src/a.ts", "unit", 4)).toContain(
      "--mutate 'src/a.ts' --suite unit --max-mutants 4",
    );
  });

  it("installs the harness with base64 writes only and excludes .neotest from git", async () => {
    const commands: string[] = [];
    const run: RunInWorkspace = async (command) => {
      commands.push(command);
      return { exit_code: 0, stdout: "" };
    };
    expect(await installHarness(run)).toBe(true);
    expect(commands[0]).toContain(".git/info/exclude");
    const writes = commands.filter((c) => c.includes("base64"));
    expect(writes.length).toBeGreaterThan(0);
    expect(
      writes.every((c) => /base64 -d >>? '\.neotest\/run\.mjs'$/.test(c)),
    ).toBe(true);
    // No raw harness source in any command.
    expect(commands.some((c) => c.includes("spawn("))).toBe(false);
  });

  it("starts a run detached and refuses unsafe run ids", async () => {
    const commands: string[] = [];
    const run: RunInWorkspace = async (command) => {
      commands.push(command);
      return { exit_code: 0, stdout: "started" };
    };
    expect(await startRun(run, "run-1", ["unit"])).toEqual({ ok: true });
    expect(commands[0]).toMatch(
      /nohup node \.neotest\/run\.mjs .* --suites unit > '\.neotest\/runs\/run-1\/harness\.log' 2>&1 < \/dev\/null &/,
    );
    expect(await startRun(run, "run 1; rm -rf /")).toEqual({
      ok: false,
      error: "bad run id",
    });
  });

  it("polls status.json until finished and reports progress once per change", async () => {
    const states: (HarnessStatus | null)[] = [
      null,
      {
        version: 1,
        runId: "r",
        startedAt: "a",
        suites: [{ id: "unit", status: "running", artifacts: [] }],
      },
      {
        version: 1,
        runId: "r",
        startedAt: "a",
        suites: [{ id: "unit", status: "running", artifacts: [] }],
      },
      {
        version: 1,
        runId: "r",
        startedAt: "a",
        finishedAt: "b",
        suites: [{ id: "unit", status: "passed", artifacts: [] }],
      },
    ];
    let i = 0;
    const run: RunInWorkspace = async () => {
      const state = states[Math.min(i, states.length - 1)];
      i += 1;
      return {
        exit_code: 0,
        stdout: state
          ? Buffer.from(JSON.stringify(state)).toString("base64")
          : "",
      };
    };
    const onProgress = vi.fn();
    const { status, timedOut } = await waitForStatus(run, "r", {
      intervalMs: 0,
      sleep: async () => {},
      onProgress,
    });
    expect(timedOut).toBe(false);
    expect(status?.finishedAt).toBe("b");
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it("gives up after the timeout with the last status it saw", async () => {
    let now = 0;
    const run: RunInWorkspace = async () => ({ exit_code: 0, stdout: "" });
    const { status, timedOut } = await waitForStatus(run, "r", {
      intervalMs: 1000,
      timeoutMs: 2500,
      sleep: async () => {
        now += 1000;
      },
      now: () => now,
    });
    expect(timedOut).toBe(true);
    expect(status).toBeNull();
  });

  it("writes the run report plus the always-current REPORT.md and latest.json", async () => {
    const targets: string[] = [];
    const run: RunInWorkspace = async (command) => {
      const m = command.match(/> '([^']+)'$/);
      if (m) targets.push(m[1]);
      return { exit_code: 0, stdout: "" };
    };
    const report = { runId: "run-9" } as TestReport;
    const written = await writeReportFiles(run, report, "# md");
    expect(written).toEqual([
      ".neotest/runs/run-9/report.json",
      ".neotest/latest.json",
      ".neotest/REPORT.md",
    ]);
    expect(new Set(targets)).toEqual(new Set(written));
  });
});
