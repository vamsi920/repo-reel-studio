import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMMAND_SHAPES,
  RECEIPT_NEXT_STEP,
  completionBlockers,
  executeRun,
  handleTestControlAction,
  replayMissedTestCommands,
  shouldAutoContinue,
  shouldContinueMidPlan,
  withNextStep,
} from "#/services/test-control";
import { TEST_RESULT_PREFIX } from "#/constants/test-control";
import { isTestReceiptEvent } from "#/utils/test-receipt";
import { useTestStudioStore } from "#/stores/test-studio-store";
import { useSynthStudioStore } from "#/stores/synth-studio-store";
import type { TestControlAction } from "#/types/agent-server/core";
import type { RunInWorkspace } from "#/lib/modernization/replay-harness";

vi.mock(
  "#/api/conversation-service/agent-server-conversation-service.api",
  () => ({
    default: { sendMessage: vi.fn().mockResolvedValue(undefined) },
  }),
);

const CONVERSATION = "conv-test";

function action(
  command: string,
  payload?: Record<string, unknown>,
): TestControlAction {
  return {
    kind: "ClientAction_test_control",
    command,
    payload: payload ?? null,
  } as unknown as TestControlAction;
}

function parseReceipt(message: string): Record<string, unknown> {
  expect(message.startsWith(TEST_RESULT_PREFIX)).toBe(true);
  return JSON.parse(message.slice(TEST_RESULT_PREFIX.length));
}

const JUNIT = `<testsuites><testsuite name="s"><testcase name="a" classname="s"/><testcase name="b" classname="s"><failure message="nope">nope</failure></testcase></testsuite></testsuites>`;

/**
 * A fake workspace: a Node project on disk, a harness that "runs" the
 * moment it is started (status.json appears finished), writes recorded.
 */
function fakeWorkspace(options: { junit?: string; startFails?: boolean } = {}) {
  const written: string[] = [];
  const commands: string[] = [];
  let started: { runId: string; suites: string[] } | null = null;
  const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64");
  const run: RunInWorkspace = async (command) => {
    commands.push(command);
    if (command.startsWith("find ."))
      return { exit_code: 0, stdout: "./package.json\n./vitest.config.ts\n" };
    if (command.startsWith("test -f .neodevex/kt/INDEX.md"))
      return { exit_code: 0, stdout: "yes\n" };
    if (command.startsWith("ls -1d synthetic-data"))
      return { exit_code: 0, stdout: "synthetic-data/run_1/\n" };
    const read = command.match(
      /^test -f '([^']+)' && head -c \d+ '[^']+' \| base64/,
    );
    if (read) {
      const path = read[1];
      if (path === "package.json")
        return {
          exit_code: 0,
          stdout: b64(JSON.stringify({ devDependencies: { vitest: "1" } })),
        };
      if (path.endsWith("status.json") && started) {
        const status = {
          version: 1,
          runId: started.runId,
          startedAt: "2026-10-30T10:00:00Z",
          finishedAt: "2026-10-30T10:01:00Z",
          commit: "abc123",
          suites: started.suites.map((id) => ({
            id,
            status: "passed",
            exitCode: 0,
            durationMs: 1200,
            artifacts: [
              {
                path: `.neotest/runs/${started!.runId}/artifacts/${id}/junit.xml`,
                format: "junit",
                bytes: 10,
              },
            ],
          })),
        };
        return { exit_code: 0, stdout: b64(JSON.stringify(status)) };
      }
      if (path.endsWith("mutation.json") && started) {
        return {
          exit_code: 0,
          stdout: b64(
            JSON.stringify({
              version: 1,
              runId: started.runId,
              suiteId: "unit",
              file: "src/a.ts",
              startedAt: "a",
              finishedAt: "b",
              mutants: [
                {
                  file: "src/a.ts",
                  line: 2,
                  from: "<",
                  to: ">=",
                  killed: true,
                },
                {
                  file: "src/a.ts",
                  line: 5,
                  from: "&&",
                  to: "||",
                  killed: false,
                },
              ],
            }),
          ),
        };
      }
      if (path.endsWith("junit.xml"))
        return { exit_code: 0, stdout: b64(options.junit ?? JUNIT) };
      return { exit_code: 0, stdout: "" };
    }
    if (command.includes("nohup node .neotest/run.mjs")) {
      if (options.startFails)
        return { exit_code: 1, stdout: "", stderr: "node: not found" };
      const runId = command.match(/--run (\S+)/)![1];
      const suites = command.match(/--suites (\S+)/)?.[1].split(",") ?? [
        "unit",
        "api",
      ];
      started = {
        runId,
        suites: command.includes("--mutate") ? ["unit"] : suites,
      };
      return { exit_code: 0, stdout: "started" };
    }
    const write = command.match(/base64 -d >>? '?([^' ]+)'?$/);
    if (write) {
      if (!written.includes(write[1])) written.push(write[1]);
      return { exit_code: 0, stdout: "" };
    }
    return { exit_code: 0, stdout: "" };
  };
  return { run, written, commands };
}

const POLL = { intervalMs: 0, sleep: async () => {}, timeoutMs: 10_000 };

async function dispatch(
  command: string,
  payload?: Record<string, unknown>,
  runInWorkspace?: RunInWorkspace,
) {
  const postResult = vi.fn();
  await handleTestControlAction(action(command, payload), {
    postResult,
    conversationId: CONVERSATION,
    runInWorkspace,
    now: () => Date.parse("2026-10-30T10:00:00Z"),
    poll: POLL,
  });
  return postResult.mock.calls.map((c) => parseReceipt(c[0] as string));
}

function seedProject() {
  const store = useTestStudioStore.getState();
  store.reset();
  const project = store.createProject({
    name: "shop",
    source: { kind: "folder", name: "/work/shop" },
  });
  store.setConversationId(project.id, CONVERSATION);
  return project.id;
}

const STACK = {
  languages: ["javascript/typescript"],
  runners: ["vitest"],
  app_start: { command: "npm start", url: "http://localhost:3000" },
  existing_suites: [
    { kind: "unit", name: "vitest", command: "npx vitest run" },
  ],
  evidence: ["package.json", "vitest.config.ts"],
};

const PLAN = {
  suites: [
    {
      id: "unit",
      kind: "unit",
      name: "Vitest",
      command:
        "npx vitest run --reporter=junit --outputFile=.neotest/results/junit.xml",
      results: [{ path: ".neotest/results/junit.xml", format: "junit" }],
      origin: "existing",
    },
    {
      id: "api",
      kind: "api",
      name: "API",
      command: "node api.test.mjs",
      results: [{ path: ".neotest/results/api-junit.xml" }],
    },
    {
      kind: "accessibility",
      name: "axe",
      not_applicable: "CLI tool, no pages",
    },
  ],
};

describe("test_control dispatcher", () => {
  let projectId: string;
  beforeEach(() => {
    projectId = seedProject();
    useSynthStudioStore.getState().reset();
  });

  it("rejects unknown commands and conversations without a project", async () => {
    expect((await dispatch("nope"))[0]).toEqual(
      expect.objectContaining({
        status: "rejected",
        reason: "unknown_command",
      }),
    );
    useTestStudioStore.getState().reset();
    expect((await dispatch("describe"))[0]).toEqual(
      expect.objectContaining({ status: "rejected", reason: "no_project" }),
    );
  });

  it("describe reports stack hints, KT docs, Synth datasets, shapes and blockers", async () => {
    const synth = useSynthStudioStore.getState();
    const sp = synth.createProject({
      name: "shop",
      source: { kind: "folder", name: "/work/shop" },
    });
    synth.addRun(sp.id, {
      id: "run_1",
      scenarioId: "realistic",
      scenarioName: "Realistic",
      seed: 1,
      modelHash: "h",
      formats: ["json"],
      startedAt: "a",
      finishedAt: "b",
      rowsTotal: 500,
      rowsPerEntity: {},
      edgeRowsPerEntity: {},
      validation: { ok: true, checksTotal: 1, checksPassed: 1, failed: [] },
      warnings: [],
      workspaceDir: "synthetic-data/run_1",
      writtenFiles: [],
      preview: {},
      triggeredBy: "agent",
    });
    const { run } = fakeWorkspace();
    const [receipt] = await dispatch("describe", {}, run);
    expect(receipt.status).toBe("ok");
    expect(receipt.resumed).toBe(false);
    const hints = receipt.stack_hints as {
      runners: string[];
      suggested_suites: unknown[];
    };
    expect(hints.runners).toContain("vitest");
    expect(hints.suggested_suites.length).toBeGreaterThan(0);
    expect(
      (receipt.kt_docs as { present_in_workspace: boolean })
        .present_in_workspace,
    ).toBe(true);
    const synthData = receipt.synth_data as {
      datasets: { dir: string; rows: number }[];
      workspace_dirs: string[];
    };
    expect(synthData.datasets[0]).toEqual(
      expect.objectContaining({ dir: "synthetic-data/run_1", rows: 500 }),
    );
    expect(synthData.workspace_dirs).toEqual(["synthetic-data/run_1"]);
    expect(receipt.completion_blockers).toEqual([
      "no_stack",
      "no_plan",
      "no_run",
    ]);
    expect(receipt.commands).toEqual(COMMAND_SHAPES);
  });

  it("refuses set_plan before record_stack, and record_stack without evidence or with a secret", async () => {
    expect((await dispatch("set_plan", PLAN))[0]).toEqual(
      expect.objectContaining({ status: "rejected", reason: "stack_required" }),
    );
    expect(
      (await dispatch("record_stack", { ...STACK, evidence: [] }))[0].reason,
    ).toBe("missing_evidence");
    expect(
      (
        await dispatch("record_stack", {
          ...STACK,
          notes: "DATABASE_URL=postgres://user:hunter2secret@db/x",
        })
      )[0].reason,
    ).toBe("secret_detected");
    const [ok] = await dispatch("record_stack", STACK);
    expect(ok.status).toBe("ok");
    expect(
      useTestStudioStore.getState().projects[projectId].stack?.appStart?.url,
    ).toBe("http://localhost:3000");
    expect(useTestStudioStore.getState().projects[projectId].status).toBe(
      "planning",
    );
  });

  it("set_plan validates suites, keeps not-applicable kinds with a reason, and warns about missing result files", async () => {
    await dispatch("record_stack", STACK);
    const [receipt] = await dispatch("set_plan", {
      suites: [
        ...PLAN.suites,
        { kind: "e2e", name: "no command" },
        { kind: "bogus", name: "x", command: "y" },
      ],
    });
    expect(receipt.status).toBe("ok");
    expect((receipt.rejected as string[]).length).toBe(2);
    const plan = useTestStudioStore.getState().projects[projectId].plan;
    expect(plan.map((s) => s.id)).toEqual(["unit", "api", "accessibility-axe"]);
    expect(plan[2].notApplicable).toBe("CLI tool, no pages");
    expect(plan[1].results[0].format).toBe("auto");
    expect(receipt.kinds_without_suite).not.toContain("unit");
    expect(useTestStudioStore.getState().projects[projectId].status).toBe(
      "ready",
    );
  });

  it("refuses to wave away security, and HTTP kinds once an app start is recorded", async () => {
    await dispatch("record_stack", STACK);
    const [receipt] = await dispatch("set_plan", {
      suites: [
        ...PLAN.suites,
        { kind: "security", name: "audit", not_applicable: "no deps" },
        { kind: "performance", name: "load", not_applicable: "not needed" },
        { kind: "contract", name: "pact", not_applicable: "no consumers" },
      ],
    });
    const rejected = receipt.rejected as string[];
    expect(
      rejected.some((r) => r.includes("security is always applicable")),
    ).toBe(true);
    expect(rejected.some((r) => r.includes("performance is applicable"))).toBe(
      true,
    );
    const plan = useTestStudioStore.getState().projects[projectId].plan;
    expect(plan.some((s) => s.kind === "contract" && s.notApplicable)).toBe(
      true,
    );
    expect(plan.some((s) => s.kind === "security")).toBe(false);
  });

  it("set_gates merges valid rules by id and reports rejected ones", async () => {
    const [receipt] = await dispatch("set_gates", {
      gates: [
        { id: "p95-budget", metric: "p95_ms", threshold: 300 },
        { metric: "nope", threshold: 1 },
      ],
    });
    expect(receipt.status).toBe("ok");
    expect(receipt.rejected).toHaveLength(1);
    const gates = useTestStudioStore.getState().projects[projectId].gates;
    expect(gates.find((g) => g.id === "p95-budget")?.threshold).toBe(300);
    expect(gates.length).toBe(11);
  });

  it("ask_choice opens a card and answers pending_user; a repeated question returns the saved answer", async () => {
    const question = {
      question_id: "flows",
      title: "Which flows matter most?",
      kind: "multi",
      options: [
        { id: "checkout", label: "Checkout", recommended: true },
        { id: "login", label: "Login" },
      ],
    };
    expect((await dispatch("ask_choice", question))[0]).toEqual(
      expect.objectContaining({ status: "pending_user", question_id: "flows" }),
    );
    expect(
      useTestStudioStore.getState().projects[projectId].questions[0].status,
    ).toBe("open");
    useTestStudioStore
      .getState()
      .answerQuestion(projectId, "flows", ["checkout"]);
    expect((await dispatch("ask_choice", question))[0]).toEqual(
      expect.objectContaining({ status: "answered", selected: ["checkout"] }),
    );
    expect((await dispatch("ask_choice", { title: "no id" }))[0].reason).toBe(
      "invalid_question",
    );
  });

  it("run is refused without a plan or runtime, then executes the harness, parses artifacts and files the report", async () => {
    await dispatch("record_stack", STACK);
    expect((await dispatch("run", {}))[0].reason).toBe("no_runtime");
    const { run, written } = fakeWorkspace();
    expect((await dispatch("run", {}, run))[0].reason).toBe("no_plan");
    await dispatch("set_plan", PLAN);
    expect((await dispatch("run", { suite_ids: ["ghost"] }, run))[0]).toEqual(
      expect.objectContaining({ reason: "unknown_suites", detail: "ghost" }),
    );

    const [receipt] = await dispatch("run", {}, run);
    expect(receipt.status).toBe("ok");
    expect(receipt.verdict).toBe("failed");
    expect(receipt.tests).toEqual({
      total: 4,
      passed: 2,
      failed: 2,
      skipped: 0,
      error: 0,
      flaky: 0,
    });
    expect((receipt.failures as unknown[]).length).toBe(2);
    expect(receipt.report_md).toBe(".neotest/REPORT.md");
    expect(written).toEqual(
      expect.arrayContaining([
        ".neotest/run.mjs",
        ".neotest/plan.json",
        ".neotest/REPORT.md",
        ".neotest/latest.json",
      ]),
    );
    const project = useTestStudioStore.getState().projects[projectId];
    expect(project.runs).toHaveLength(1);
    expect(project.runs[0].status).toBe("done");
    expect(project.runs[0].report?.suites.map((s) => s.status)).toEqual([
      "failed",
      "failed",
    ]);
    expect(project.status).toBe("reporting");
    expect(project.log.some((l) => l.text.includes("FAILED"))).toBe(true);
  });

  it("run reports start failures with guidance and does not leave the run hanging", async () => {
    await dispatch("record_stack", STACK);
    await dispatch("set_plan", PLAN);
    const { run } = fakeWorkspace({ startFails: true });
    const [receipt] = await dispatch("run", {}, run);
    expect(receipt).toEqual(
      expect.objectContaining({ status: "rejected", reason: "start_failed" }),
    );
    const project = useTestStudioStore.getState().projects[projectId];
    expect(project.runs[0].status).toBe("failed");
    expect(project.status).toBe("ready");
  });

  it("prove runs the mutation mode and attaches the score to the latest report", async () => {
    await dispatch("record_stack", STACK);
    await dispatch("set_plan", PLAN);
    const { run } = fakeWorkspace({
      junit: `<testsuites><testsuite name="s"><testcase name="a" classname="s"/></testsuite></testsuites>`,
    });
    await dispatch("run", { suite_ids: ["unit"] }, run);
    expect((await dispatch("prove", { file: "src/a.ts" }, run))[0].reason).toBe(
      "missing_fields",
    );
    expect(
      (
        await dispatch(
          "prove",
          { file: "../etc/passwd", suite_id: "unit" },
          run,
        )
      )[0].reason,
    ).toBe("bad_file");
    const [receipt] = await dispatch(
      "prove",
      { file: "src/a.ts", suite_id: "unit" },
      run,
    );
    expect(receipt).toEqual(
      expect.objectContaining({ status: "ok", killed: 1, total: 2 }),
    );
    expect(receipt.survivors).toEqual([{ line: 5, mutator: "&& → ||" }]);
    const report =
      useTestStudioStore.getState().projects[projectId].runs[0].report!;
    expect(report.mutation?.score).toBe(50);
    expect(
      report.gates.results.find((g) => g.rule.id === "mutation")?.verdict,
    ).toBe("warned");
    // A later run on the same commit keeps the proof.
    await dispatch("run", { suite_ids: ["unit"] }, run);
    const later =
      useTestStudioStore.getState().projects[projectId].runs[1].report!;
    expect(later.mutation?.score).toBe(50);
  });

  it("record_finding requires evidence and rejects secrets", async () => {
    expect(
      (
        await dispatch("record_finding", {
          findings: [
            { title: "x", severity: "high", kind: "unit", description: "d" },
          ],
        })
      )[0].reason,
    ).toBe("no_valid_findings");
    const [ok] = await dispatch("record_finding", {
      findings: [
        {
          title: "Discount can go negative",
          severity: "high",
          kind: "unit",
          description: "applyDiscount accepts -1",
          file: "src/cart.ts",
          line: 42,
          evidence: ["tests/cart.test.ts::rejects negative"],
        },
      ],
    });
    expect(ok.status).toBe("ok");
    expect(
      useTestStudioStore.getState().projects[projectId].findings[0],
    ).toEqual(expect.objectContaining({ severity: "high", status: "open" }));
  });

  it("complete is refused until every applicable suite ran and no card is open", async () => {
    expect((await dispatch("complete", { summary: "done" }))[0]).toEqual(
      expect.objectContaining({
        reason: "not_complete",
        blockers: ["no_stack", "no_plan", "no_run"],
      }),
    );
    await dispatch("record_stack", STACK);
    await dispatch("set_plan", PLAN);
    const { run } = fakeWorkspace();
    await dispatch("run", { suite_ids: ["unit"] }, run);
    const blockers = completionBlockers(
      useTestStudioStore.getState().projects[projectId],
    );
    expect(blockers).toEqual(["suites_never_run:api", "no_mutation_proof"]);
    await dispatch("run", { suite_ids: ["api"] }, run);
    expect(
      (await dispatch("complete", { summary: "done" }))[0].blockers,
    ).toEqual(["no_mutation_proof"]);
    await dispatch("prove", { file: "src/a.ts", suite_id: "unit" }, run);
    await dispatch("ask_choice", {
      question_id: "q",
      title: "t",
      options: [{ id: "a", label: "A" }],
    });
    expect(
      (await dispatch("complete", { summary: "done" }))[0].blockers,
    ).toEqual(["open_questions"]);
    useTestStudioStore.getState().answerQuestion(projectId, "q", ["a"]);
    expect((await dispatch("complete", {}))[0].reason).toBe("missing_summary");
    const [done] = await dispatch("complete", {
      summary: "Unit and API suites run; two failures recorded as findings.",
    });
    expect(done).toEqual(
      expect.objectContaining({
        status: "ok",
        verdict: "failed",
        report_md: ".neotest/REPORT.md",
      }),
    );
    expect(useTestStudioStore.getState().projects[projectId].status).toBe(
      "done",
    );
  });

  it("log appends to the live log without a receipt; actions are dispatched once per id", async () => {
    expect(
      await dispatch("log", { text: "reading routes", level: "info" }),
    ).toEqual([]);
    expect(useTestStudioStore.getState().projects[projectId].log[0].text).toBe(
      "reading routes",
    );
    const postResult = vi.fn();
    const ctx = { postResult, conversationId: CONVERSATION, actionId: "evt-1" };
    await handleTestControlAction(action("describe"), ctx);
    await handleTestControlAction(action("describe"), ctx);
    expect(postResult).toHaveBeenCalledTimes(1);
  });
});

describe("receipts and nudges", () => {
  beforeEach(() => {
    seedProject();
  });

  it("adds the next-step hint to receipts once and hides receipts from the transcript", () => {
    const once = withNextStep(`${TEST_RESULT_PREFIX}{"status":"ok"}`);
    expect(JSON.parse(once.slice(TEST_RESULT_PREFIX.length)).next).toBe(
      RECEIPT_NEXT_STEP,
    );
    expect(withNextStep(once)).toBe(once);
    expect(withNextStep("plain text")).toBe("plain text");
    const event = {
      kind: "MessageEvent",
      id: "m1",
      timestamp: "t",
      source: "user",
      llm_message: {
        role: "user",
        content: [{ type: "text", text: `${TEST_RESULT_PREFIX}{}` }],
      },
    } as never;
    expect(isTestReceiptEvent(event)).toBe(true);
  });

  it("nudges once after an answered card and once per idle period mid-plan, never with a card open", () => {
    const project = Object.values(useTestStudioStore.getState().projects)[0];
    const base = {
      agentIdle: true,
      lastReceiptAt: 1000,
      nudgedForReceiptAt: null,
      now: 2000,
      project,
    };
    expect(shouldAutoContinue(base)).toBe(true);
    expect(shouldAutoContinue({ ...base, nudgedForReceiptAt: 1000 })).toBe(
      false,
    );
    expect(shouldAutoContinue({ ...base, now: 1000 + 200_000 })).toBe(false);
    const mid = {
      agentIdle: true,
      idleAt: 5,
      nudgedForIdleAt: null,
      nudgesWithoutProgress: 0,
      lastAgentText: "Now I will write the plan.",
      project,
    };
    expect(shouldContinueMidPlan(mid)).toBe(true);
    expect(
      shouldContinueMidPlan({
        ...mid,
        lastAgentText: "Which flows matter most?",
      }),
    ).toBe(false);
    expect(shouldContinueMidPlan({ ...mid, nudgesWithoutProgress: 3 })).toBe(
      false,
    );
    expect(
      shouldContinueMidPlan({
        ...mid,
        project: {
          ...project,
          questions: [
            {
              id: "q",
              title: "t",
              kind: "single",
              options: [],
              allowOther: false,
              status: "open",
              selected: [],
              at: "t",
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it("replays missed commands except run/prove, which are answered with studio_was_away", async () => {
    const projectId = Object.keys(useTestStudioStore.getState().projects)[0];
    const postResult = vi.fn();
    const events = [
      {
        kind: "ActionEvent",
        id: "e1",
        timestamp: "t",
        source: "agent",
        tool_name: "test_control",
        tool_call_id: "c1",
        action: action("record_stack", STACK),
      },
      {
        kind: "ActionEvent",
        id: "e2",
        timestamp: "t",
        source: "agent",
        tool_name: "test_control",
        tool_call_id: "c2",
        action: action("run", {}),
      },
      {
        kind: "ActionEvent",
        id: "e3",
        timestamp: "t",
        source: "agent",
        tool_name: "test_control",
        tool_call_id: "c3",
        action: action("log", { text: "x" }),
      },
    ] as never[];
    const replayed = await replayMissedTestCommands(events, {
      postResult,
      conversationId: CONVERSATION,
    });
    expect(replayed).toEqual(["e1", "e2"]);
    expect(
      useTestStudioStore.getState().projects[projectId].stack,
    ).not.toBeNull();
    const receipts = postResult.mock.calls.map((c) =>
      parseReceipt(c[0] as string),
    );
    expect(receipts.find((r) => r.reason === "studio_was_away")).toBeTruthy();
    expect(
      useTestStudioStore.getState().projects[projectId].handledActionIds,
    ).toEqual(["e1", "e2", "e3"]);
    expect(
      await replayMissedTestCommands(events, {
        postResult,
        conversationId: CONVERSATION,
      }),
    ).toEqual([]);
  });
});

describe("executeRun from the workbench", () => {
  it("records a user-triggered run", async () => {
    const projectId = seedProject();
    const store = useTestStudioStore.getState();
    store.upsertSuites(projectId, [
      {
        id: "unit",
        kind: "unit",
        name: "Unit",
        command: "npm test",
        results: [{ path: "j.xml", format: "junit" }],
        origin: "existing",
      },
    ]);
    const { run } = fakeWorkspace();
    const outcome = await executeRun(projectId, {
      triggeredBy: "user",
      runInWorkspace: run,
      poll: POLL,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.report.trigger).toBe("user");
      expect(outcome.report.commit).toBe("abc123");
    }
    expect(
      (await executeRun(projectId, { triggeredBy: "user", poll: POLL })).ok,
    ).toBe(false);
  });
});
