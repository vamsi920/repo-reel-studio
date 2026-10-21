import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleModernizationControlAction,
  withNextStep,
  RECEIPT_NEXT_STEP,
  COMMAND_SHAPES,
} from "#/services/modernization-control";
import { MODERNIZATION_RESULT_PREFIX } from "#/constants/modernization-control";
import { isModernizationReceiptEvent } from "#/utils/modernization-receipt";
import { useModernizationStudioStore } from "#/stores/modernization-studio-store";
import type { ModernizationControlAction } from "#/types/agent-server/core";

vi.mock(
  "#/api/conversation-service/agent-server-conversation-service.api",
  () => ({
    default: { sendMessage: vi.fn().mockResolvedValue(undefined) },
  }),
);

const CONVERSATION = "conv-1";

function action(
  command: string,
  payload?: Record<string, unknown>,
): ModernizationControlAction {
  return {
    kind: "ClientAction_modernization_control",
    command,
    payload: payload ?? null,
  } as unknown as ModernizationControlAction;
}

function parseReceipt(message: string): Record<string, unknown> {
  expect(message.startsWith(MODERNIZATION_RESULT_PREFIX)).toBe(true);
  return JSON.parse(message.slice(MODERNIZATION_RESULT_PREFIX.length));
}

async function dispatch(command: string, payload?: Record<string, unknown>) {
  const postResult = vi.fn();
  await handleModernizationControlAction(action(command, payload), {
    postResult,
    conversationId: CONVERSATION,
  });
  return postResult.mock.calls.map((call) => parseReceipt(call[0] as string));
}

function seedProject() {
  const store = useModernizationStudioStore.getState();
  store.reset();
  const project = store.createProject({
    name: "legacy-shop",
    source: { kind: "repository", name: "acme/legacy-shop", branch: "main" },
  });
  store.setConversationId(project.id, CONVERSATION);
  return project.id;
}

describe("modernization_control dispatcher", () => {
  let projectId: string;
  beforeEach(() => {
    projectId = seedProject();
  });

  it("rejects unknown commands with the valid list, and rejects when no project owns the conversation", async () => {
    const [unknown] = await dispatch("explode");
    expect(unknown.status).toBe("rejected");
    expect(unknown.valid_commands).toContain("describe");

    useModernizationStudioStore.getState().reset();
    const [orphan] = await dispatch("describe");
    expect(orphan).toMatchObject({ status: "rejected", reason: "no_project" });
  });

  it("describe returns the project, payload shapes, and resumed=false on a fresh project", async () => {
    const [r] = await dispatch("describe");
    expect(r.status).toBe("ok");
    expect(r.resumed).toBe(false);
    expect(r.commands).toEqual(COMMAND_SHAPES);
    expect((r.project as { source: { name: string } }).source.name).toBe(
      "acme/legacy-shop",
    );
  });

  it("record_discovery upserts components with resolved logos, refuses secrets, and moves status to discovering", async () => {
    const [ok] = await dispatch("record_discovery", {
      components: [
        {
          name: "Web API",
          kind: "backend",
          language: "Python",
          framework: "Flask",
          evidence: ["app.py"],
        },
        {
          name: "Web API",
          kind: "backend",
          version: "2.3",
          evidence: ["requirements.txt"],
        },
        { nope: true },
      ],
    });
    expect(ok.status).toBe("ok");
    expect(ok.recorded).toEqual(["web-api"]);
    const project = useModernizationStudioStore.getState().projects[projectId];
    expect(project.components).toHaveLength(1);
    expect(project.components[0]).toMatchObject({
      logo: "flask",
      version: "2.3",
      framework: "Flask",
    });
    expect(project.status).toBe("discovering");

    const [secret] = await dispatch("record_discovery", {
      components: [
        {
          name: "DB",
          kind: "database",
          evidence: ["sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdef"],
        },
      ],
    });
    expect(secret).toMatchObject({
      status: "rejected",
      reason: "looks_like_credential",
    });
  });

  it("ask_choice renders a card, answers pending_user, and the user's answer is recorded", async () => {
    const [pending] = await dispatch("ask_choice", {
      question_id: "backend-target",
      title: "Which backend framework?",
      kind: "single",
      options: [
        { id: "fastapi", label: "FastAPI", recommended: true },
        { label: "NestJS" },
      ],
    });
    expect(pending).toMatchObject({
      status: "pending_user",
      question_id: "backend-target",
    });
    const project = useModernizationStudioStore.getState().projects[projectId];
    expect(project.questions[0].options.map((o) => [o.id, o.logo])).toEqual([
      ["fastapi", "fastapi"],
      ["nestjs", "nestjs"],
    ]);
    expect(project.status).toBe("interviewing");

    const answered = useModernizationStudioStore
      .getState()
      .answerQuestion(projectId, "backend-target", ["fastapi"]);
    expect(answered?.status).toBe("answered");
    const [desc] = await dispatch("describe");
    expect(desc.answers).toEqual([
      {
        question_id: "backend-target",
        title: "Which backend framework?",
        selected: ["fastapi"],
        other: undefined,
        component_id: undefined,
      },
    ]);
  });

  it("set_plan needs discovery first, then publishes steps and flips the project to planned", async () => {
    const [noDiscovery] = await dispatch("set_plan", {
      steps: [{ id: "s1", phase: "specify", title: "Write spec" }],
    });
    expect(noDiscovery).toMatchObject({
      status: "rejected",
      reason: "discovery_required",
    });

    await dispatch("record_discovery", {
      components: [{ name: "UI", kind: "frontend", evidence: ["src/"] }],
    });
    const [ok] = await dispatch("set_plan", {
      steps: [
        {
          id: "s1",
          phase: "specify",
          title: "Write spec",
          status: "in_progress",
        },
        { phase: "migrate", title: "Port users module", weight: 3 },
        { phase: "nonsense", title: "dropped" },
      ],
    });
    expect(ok.status).toBe("ok");
    expect(ok.steps).toEqual(["s1", "migrate-port-users-module"]);
    expect(ok.invalid).toHaveLength(1);
    const project = useModernizationStudioStore.getState().projects[projectId];
    expect(project.status).toBe("planned");
    expect(project.currentStepId).toBe("s1");
    expect(project.plan[0].status).toBe("active");
  });

  it("update_progress tracks step status, counters, and derives the project status; unknown steps are refused", async () => {
    await dispatch("record_discovery", {
      components: [{ name: "UI", kind: "frontend", evidence: ["src/"] }],
    });
    await dispatch("set_plan", {
      steps: [
        { id: "spec", phase: "specify", title: "Spec" },
        { id: "port", phase: "migrate", title: "Port" },
        { id: "check", phase: "verify", title: "Verify" },
      ],
    });
    const [bad] = await dispatch("update_progress", {
      step_id: "ghost",
      status: "done",
    });
    expect(bad).toMatchObject({ status: "rejected", reason: "unknown_step" });

    await dispatch("update_progress", { step_id: "spec", status: "done" });
    // Building without an approval is refused; the Start button (or a
    // request_approval the user accepted) unlocks it.
    const [noApproval] = await dispatch("update_progress", {
      step_id: "port",
      status: "active",
    });
    expect(noApproval).toMatchObject({
      status: "rejected",
      reason: "approval_required",
    });
    await dispatch("request_approval", {
      approval_id: "go",
      what: "Start building",
    });
    useModernizationStudioStore
      .getState()
      .resolveApproval(projectId, "go", "approved");
    const [mig] = await dispatch("update_progress", {
      step_id: "port",
      status: "active",
      stats: {
        files_total: 40,
        files_done: 12,
        tests_total: 20,
        tests_passing: 9,
        extra: { screens: "2/7" },
      },
    });
    expect(mig.progress).toEqual({ steps_done: 1, steps_total: 3 });
    let project = useModernizationStudioStore.getState().projects[projectId];
    expect(project.status).toBe("migrating");
    expect(project.stats).toMatchObject({
      filesTotal: 40,
      filesDone: 12,
      extra: { screens: "2/7" },
    });

    await dispatch("update_progress", { stats: { tests_passing: 20 } });
    project = useModernizationStudioStore.getState().projects[projectId];
    expect(project.stats.filesTotal).toBe(40);
    expect(project.stats.testsPassing).toBe(20);

    await dispatch("update_progress", { step_id: "port", status: "done" });
    await dispatch("update_progress", { step_id: "check", status: "active" });
    expect(
      useModernizationStudioStore.getState().projects[projectId].status,
    ).toBe("verifying");

    // Verify is only done with a green run reported in the same call.
    const [notGreen] = await dispatch("update_progress", {
      step_id: "check",
      status: "done",
      stats: { tests_total: 20, tests_passing: 19 },
    });
    expect(notGreen).toMatchObject({
      status: "rejected",
      reason: "verification_not_green",
      detail: "tests_failing:1",
    });
    // Green unit tests are not enough: the shared black-box suite must pass
    // against both the legacy and the new app.
    const [noParity] = await dispatch("update_progress", {
      step_id: "check",
      status: "done",
      stats: { tests_total: 20, tests_passing: 20 },
    });
    expect(noParity).toMatchObject({
      status: "rejected",
      reason: "parity_not_proven",
      detail: "no_parity_reported",
    });
    const [drift] = await dispatch("update_progress", {
      step_id: "check",
      status: "done",
      stats: { parity_total: 42, parity_passing: 40 },
    });
    expect(drift).toMatchObject({ detail: "parity_failing:2" });
    // Hand-written cases are not enough: the suite must replay against both
    // apps and include data the legacy app created.
    const [handWritten] = await dispatch("update_progress", {
      step_id: "check",
      status: "done",
      stats: { parity_total: 42, parity_passing: 42 },
    });
    expect(handWritten).toMatchObject({ detail: "parity_not_differential" });
    const [noLegacyData] = await dispatch("update_progress", {
      step_id: "check",
      status: "done",
      stats: {
        parity_total: 42,
        parity_passing: 42,
        parity_differential: true,
      },
    });
    expect(noLegacyData).toMatchObject({ detail: "no_legacy_data_cases" });
    const [green] = await dispatch("update_progress", {
      step_id: "check",
      status: "done",
      stats: {
        parity_total: 42,
        parity_passing: 42,
        parity_differential: true,
        legacy_data_cases: 3,
      },
    });
    expect(green.status).toBe("ok");
  });

  it("log is fire-and-forget, checkpoint persists state and refuses secrets, complete requires all steps settled", async () => {
    const logReceipts = await dispatch("log", {
      text: "Running pytest",
      level: "info",
    });
    expect(logReceipts).toHaveLength(0);
    expect(
      useModernizationStudioStore.getState().projects[projectId].log[0].text,
    ).toBe("Running pytest");

    const [cp] = await dispatch("checkpoint", {
      label: "after spec",
      state: { next: "port users" },
    });
    expect(cp.status).toBe("ok");
    const [cpSecret] = await dispatch("checkpoint", {
      label: "oops",
      state: { token: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" },
    });
    expect(cpSecret).toMatchObject({
      status: "rejected",
      reason: "looks_like_credential",
    });

    await dispatch("record_discovery", {
      components: [{ name: "UI", kind: "frontend", evidence: ["src/"] }],
    });
    await dispatch("set_plan", {
      steps: [
        { id: "spec", phase: "specify", title: "Spec" },
        { id: "check", phase: "verify", title: "Verify" },
      ],
    });
    const [tooEarly] = await dispatch("complete", { summary: "done" });
    expect(tooEarly).toMatchObject({
      status: "rejected",
      reason: "steps_pending",
      pending: ["spec", "check"],
    });

    await dispatch("update_progress", { step_id: "spec", status: "done" });
    await dispatch("update_progress", {
      step_id: "check",
      status: "skipped",
      note: "no",
    });
    const [unverified] = await dispatch("complete", { summary: "done" });
    expect(unverified).toMatchObject({
      status: "rejected",
      reason: "verification_required",
      missing: ["verify_step_done", "no_tests_reported", "no_parity_reported"],
    });
    await dispatch("update_progress", {
      step_id: "check",
      status: "done",
      stats: {
        tests_total: 3,
        tests_passing: 3,
        parity_total: 12,
        parity_passing: 12,
        parity_differential: true,
        no_persistent_data: true,
      },
    });
    const [done] = await dispatch("complete", {
      summary: "Migrated.",
      verification: { tests: "20/20" },
      artifacts: ["MODERNIZATION_REPORT.md"],
    });
    expect(done).toMatchObject({ status: "ok", completed: true });
    const project = useModernizationStudioStore.getState().projects[projectId];
    expect(project.status).toBe("done");
    expect(project.report?.artifacts).toEqual(["MODERNIZATION_REPORT.md"]);

    const [resumed] = await dispatch("describe");
    expect(resumed.resumed).toBe(true);
    expect((resumed.last_checkpoint as { label: string }).label).toBe(
      "after spec",
    );
  });

  it("withNextStep appends the nudge only to receipts that lack one", () => {
    const plain = withNextStep("hello");
    expect(plain).toBe("hello");
    const nudged = JSON.parse(
      withNextStep(`${MODERNIZATION_RESULT_PREFIX}{"status":"ok"}`).slice(
        MODERNIZATION_RESULT_PREFIX.length,
      ),
    );
    expect(nudged.next).toBe(RECEIPT_NEXT_STEP);
    const kept = `${MODERNIZATION_RESULT_PREFIX}{"status":"ok","next":"x"}`;
    expect(withNextStep(kept)).toBe(kept);
  });
});

describe("parity proven by Neo ME's own replay", () => {
  const NOW = Date.parse("2026-10-21T12:00:00Z");
  let report: Record<string, unknown> | null;
  let reaReport: Record<string, unknown> | null;
  let apps: Record<string, unknown> | null;
  const commands: string[] = [];
  const runInWorkspace = vi.fn(async (command: string) => {
    commands.push(command);
    if (command.includes("rea-") && command.includes("-report.json")) {
      return {
        exit_code: 0,
        stdout: reaReport ? JSON.stringify(reaReport) : "",
      };
    }
    if (command.includes("-report.json")) {
      return { exit_code: 0, stdout: report ? JSON.stringify(report) : "" };
    }
    if (command.includes("parity/apps.json")) {
      return { exit_code: 0, stdout: apps ? JSON.stringify(apps) : "" };
    }
    if (command.includes("parity/schema.sql")) {
      return {
        exit_code: 0,
        stdout: Buffer.from(
          "create table author (id integer primary key autoincrement, name text not null, email text unique);\n" +
            "create table post (id integer primary key autoincrement, author_id integer not null references author(id), title text not null, body text, created datetime);",
        ).toString("base64"),
      };
    }
    return { exit_code: 0, stdout: "" };
  });

  async function run(command: string, payload?: Record<string, unknown>) {
    const postResult = vi.fn();
    await handleModernizationControlAction(action(command, payload), {
      postResult,
      conversationId: CONVERSATION,
      runInWorkspace,
      now: () => NOW,
    });
    return postResult.mock.calls.map((call) => parseReceipt(call[0] as string));
  }

  const replayReport = (overrides: Record<string, unknown> = {}) => ({
    version: 1,
    generatedAt: "2026-10-21T11:50:00Z",
    legacy: "http://127.0.0.1:5000",
    target: "http://127.0.0.1:3000",
    scenarios: 3,
    total: 37,
    identical: 37,
    legacyDataCases: 2,
    legacyDataIdentical: 2,
    freshData: true,
    legacyStatuses: { "200": 30, "302": 5, "404": 2 },
    synthApplied: true,
    synthDataCases: 4,
    synthDataIdentical: 4,
    store: {
      applicable: true,
      compared: 3,
      identical: 3,
      skipped: [],
      differences: [],
    },
    differences: [],
    ...overrides,
  });
  const reaOk = (overrides: Record<string, unknown> = {}) => ({
    version: 1,
    kind: "rea",
    generatedAt: "2026-10-21T11:55:00Z",
    tool: "rea",
    legacy: "http://127.0.0.1:5000",
    target: "http://127.0.0.1:3000",
    scenarios: 2,
    unchanged: 2,
    freshData: true,
    harnessNormalization: ["drop_response_header_names"],
    results: [],
    ...overrides,
  });

  beforeEach(() => {
    seedProject();
    commands.length = 0;
    report = null;
    reaReport = null;
    apps = { rea: { executable_path: "/Applications/Chrome" } };
  });

  it("refuses to finish characterization until the legacy app was replayed against itself", async () => {
    await run("record_discovery", {
      components: [{ name: "API", kind: "backend", evidence: ["app.py"] }],
    });
    await run("set_plan", {
      steps: [{ id: "chars", phase: "characterize", title: "Characterize" }],
    });
    await run("update_progress", { step_id: "chars", status: "active" });
    const [missing] = await run("update_progress", {
      step_id: "chars",
      status: "done",
    });
    expect(missing).toMatchObject({
      status: "rejected",
      reason: "characterization_not_proven",
      detail: "characterization_not_run",
    });
    report = replayReport({ kind: "characterize", target: null });
    const [noRea] = await run("update_progress", {
      step_id: "chars",
      status: "done",
    });
    expect(noRea).toMatchObject({
      reason: "rea_characterization_not_proven",
      detail: "rea_report_missing",
    });
    reaReport = reaOk({ kind: "rea-characterize", target: null });
    const [ok] = await run("update_progress", {
      step_id: "chars",
      status: "done",
    });
    expect(ok.status).toBe("ok");

    // Without Synth rows loaded, characterization is not accepted either.
    report = replayReport({
      kind: "characterize",
      target: null,
      synthApplied: false,
    });
    await run("update_progress", { step_id: "chars", status: "active" });
    const [noSynth] = await run("update_progress", {
      step_id: "chars",
      status: "done",
    });
    expect(noSynth).toMatchObject({
      detail: "characterization_without_synth_data",
    });
  });

  it("generates Synth data from the legacy schema into parity/synth", async () => {
    const [missing] = await run("synth_data", {});
    expect(missing).toMatchObject({
      status: "rejected",
      reason: "missing_schema_path",
    });
    const [notFound] = await run("synth_data", {
      schema_path: "parity/nope.sql",
    });
    expect(notFound).toMatchObject({ reason: "schema_not_found" });
    commands.length = 0;
    const [ok] = await run("synth_data", {
      schema_path: "parity/schema.sql",
      scenario: "smoke",
      counts: { post: 5 },
    });
    expect(ok.status).toBe("ok");
    expect(ok.entities).toEqual(["author", "post"]);
    expect(ok.rows).toMatchObject({ post: 5 });
    expect(
      (ok.sample_primary_keys as Record<string, unknown[]>).author,
    ).toHaveLength(3);
    expect(ok.files).toEqual([
      "parity/synth/fixture.sql",
      "parity/synth/dataset.json",
      "parity/synth/model.json",
    ]);
    // Written through the runtime as base64, never as raw SQL in a command.
    expect(commands.some((c) => c.includes("> parity/synth/fixture.sql"))).toBe(
      true,
    );
    expect(commands.some((c) => c.includes("INSERT INTO"))).toBe(false);
    const project = Object.values(
      useModernizationStudioStore.getState().projects,
    )[0];
    expect(project.stats.extra?.["Synth rows"]).toBeDefined();
  });

  it("installs the harness on describe and decides verify from its report, not from claimed numbers", async () => {
    const [described] = await run("describe");
    expect(described.replay_harness).toMatchObject({
      path: ".neome/replay.mjs",
    });
    expect(commands.some((c) => c.includes("> .neome/replay.mjs"))).toBe(true);

    await run("record_discovery", {
      components: [{ name: "API", kind: "backend", evidence: ["app.py"] }],
    });
    await run("set_plan", {
      steps: [{ id: "check", phase: "verify", title: "Verify" }],
    });
    await run("update_progress", { step_id: "check", status: "active" });
    const claimed = {
      tests_total: 9,
      tests_passing: 9,
      parity_total: 11,
      parity_passing: 11,
      parity_differential: true,
      legacy_data_cases: 1,
    };

    const [missing] = await run("update_progress", {
      step_id: "check",
      status: "done",
      stats: claimed,
    });
    expect(missing).toMatchObject({
      status: "rejected",
      detail: "replay_report_missing",
    });

    report = replayReport({
      identical: 35,
      differences: [
        {
          scenario: "s",
          step: "index",
          field: "text",
          legacy: "a",
          target: "b",
        },
      ],
    });
    const [drift] = await run("update_progress", {
      step_id: "check",
      status: "done",
      stats: claimed,
    });
    expect(drift).toMatchObject({ detail: "replay_differences:2" });
    expect(drift.differences).toHaveLength(1);

    report = replayReport({ generatedAt: "2026-10-21T09:00:00Z" });
    const [stale] = await run("update_progress", {
      step_id: "check",
      status: "done",
      stats: claimed,
    });
    expect(stale).toMatchObject({ detail: "replay_report_stale" });

    report = replayReport({ freshData: false });
    const [notFresh] = await run("update_progress", {
      step_id: "check",
      status: "done",
      stats: claimed,
    });
    expect(notFresh).toMatchObject({ detail: "replay_not_fresh_data" });

    report = replayReport({ legacyStatuses: { "200": 35, "302": 2 } });
    const [noErrors] = await run("update_progress", {
      step_id: "check",
      status: "done",
      stats: claimed,
    });
    expect(noErrors).toMatchObject({ detail: "replay_no_error_paths" });

    report = replayReport({ legacyDataCases: 0, legacyDataIdentical: 0 });
    const [noLegacy] = await run("update_progress", {
      step_id: "check",
      status: "done",
      stats: claimed,
    });
    expect(noLegacy).toMatchObject({ detail: "replay_no_legacy_data" });

    report = replayReport({ synthDataCases: 0 });
    const [noSynthSteps] = await run("update_progress", {
      step_id: "check",
      status: "done",
      stats: claimed,
    });
    expect(noSynthSteps).toMatchObject({
      detail: "replay_no_synth_data_steps",
    });

    report = replayReport({
      store: {
        applicable: true,
        compared: 3,
        identical: 2,
        skipped: [],
        differences: [{ table: "post" }],
      },
    });
    const [storeDrift] = await run("update_progress", {
      step_id: "check",
      status: "done",
      stats: claimed,
    });
    expect(storeDrift).toMatchObject({ detail: "store_differences:1" });

    report = replayReport();
    const [noRea] = await run("update_progress", {
      step_id: "check",
      status: "done",
      stats: claimed,
    });
    expect(noRea).toMatchObject({
      reason: "rea_parity_not_proven",
      detail: "rea_report_missing",
    });

    reaReport = reaOk({
      unchanged: 1,
      results: [
        {
          scenario: "login",
          status: "changed",
          evidence: {},
          changed: [{ step: "home", artifact: "dom", status: "changed" }],
        },
      ],
    });
    const [reaDrift] = await run("update_progress", {
      step_id: "check",
      status: "done",
      stats: claimed,
    });
    expect(reaDrift).toMatchObject({ detail: "rea_changed:1" });
    expect(reaDrift.changed).toEqual([
      { step: "home", artifact: "dom", status: "changed" },
    ]);

    reaReport = reaOk();
    const [ok] = await run("update_progress", {
      step_id: "check",
      status: "done",
      stats: claimed,
    });
    expect(ok.status).toBe("ok");
    const project = Object.values(
      useModernizationStudioStore.getState().projects,
    )[0];
    expect(project.stats).toMatchObject({
      parityTotal: 37,
      parityPassing: 37,
      legacyDataCases: 2,
      extra: {
        "Synth-data steps": "4",
        "Store tables identical": "3/3",
        "REA browser scenarios": "2/2 unchanged",
      },
    });

    // A CLI tool may declare the browser lane not applicable, and that is recorded.
    apps = { rea: { not_applicable: "command-line tool, no browser surface" } };
    reaReport = null;
    await run("update_progress", { step_id: "check", status: "active" });
    const [cli] = await run("update_progress", {
      step_id: "check",
      status: "done",
      stats: claimed,
    });
    expect(cli.status).toBe("ok");
  });
});

describe("auto-continue after a card is answered", () => {
  const base = {
    agentIdle: true,
    lastReceiptAt: 1_000,
    nudgedForReceiptAt: null,
    now: 5_000,
    project: {
      status: "migrating" as const,
      questions: [],
      approvals: [],
    },
  };
  it("nudges once when the agent idles shortly after a receipt with nothing pending", async () => {
    const { shouldAutoContinue, AUTO_CONTINUE_WINDOW_MS } =
      await import("#/services/modernization-control");
    expect(shouldAutoContinue(base)).toBe(true);
    expect(shouldAutoContinue({ ...base, nudgedForReceiptAt: 1_000 })).toBe(
      false,
    );
    expect(shouldAutoContinue({ ...base, agentIdle: false })).toBe(false);
    expect(shouldAutoContinue({ ...base, lastReceiptAt: null })).toBe(false);
    expect(
      shouldAutoContinue({ ...base, now: 1_000 + AUTO_CONTINUE_WINDOW_MS + 1 }),
    ).toBe(false);
    expect(
      shouldAutoContinue({
        ...base,
        project: {
          ...base.project,
          approvals: [{ id: "a", what: "x", status: "pending", at: "t" }],
        },
      }),
    ).toBe(false);
    expect(
      shouldAutoContinue({
        ...base,
        project: { ...base.project, status: "paused" },
      }),
    ).toBe(false);
  });
});

describe("continue mid-plan when the agent stops early", () => {
  const base = {
    agentIdle: true,
    idleAt: 10_000,
    nudgedForIdleAt: null,
    nudgesWithoutProgress: 0,
    lastAgentText: "Now I'll start writing the characterization tests.",
    project: {
      status: "planned" as const,
      questions: [],
      approvals: [],
      plan: [
        {
          id: "spec",
          phase: "specify" as const,
          title: "Spec",
          status: "done" as const,
        },
        {
          id: "chars",
          phase: "characterize" as const,
          title: "Tests",
          status: "pending" as const,
        },
      ],
    },
  };

  it("nudges once per stop while work remains and nothing waits on the user", async () => {
    const { shouldContinueMidPlan, MID_PLAN_MAX_NUDGES } =
      await import("#/services/modernization-control");
    expect(shouldContinueMidPlan(base)).toBe(true);
    // Once per idle period, and not forever without progress.
    expect(shouldContinueMidPlan({ ...base, nudgedForIdleAt: 10_000 })).toBe(
      false,
    );
    expect(
      shouldContinueMidPlan({
        ...base,
        nudgesWithoutProgress: MID_PLAN_MAX_NUDGES,
      }),
    ).toBe(false);
    // Legitimate stops: a question to the user, a card, a finished plan.
    expect(
      shouldContinueMidPlan({
        ...base,
        lastAgentText: "Which database should we keep?",
      }),
    ).toBe(false);
    expect(
      shouldContinueMidPlan({
        ...base,
        project: {
          ...base.project,
          questions: [
            {
              id: "q",
              title: "q",
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
    expect(
      shouldContinueMidPlan({
        ...base,
        project: {
          ...base.project,
          plan: base.project.plan.map((step) => ({
            ...step,
            status: "done" as const,
          })),
        },
      }),
    ).toBe(false);
    expect(shouldContinueMidPlan({ ...base, agentIdle: false })).toBe(false);
  });
});

describe("spend checkpoint", () => {
  it("pauses a running conversation once it reaches the approved limit, once per limit", async () => {
    const { shouldPauseForSpend, spendApprovalId } =
      await import("#/services/modernization-control");
    const base = { costUsd: 10.2, limitUsd: 10, running: true, approvals: [] };
    expect(shouldPauseForSpend(base)).toBe(true);
    expect(shouldPauseForSpend({ ...base, costUsd: 9.99 })).toBe(false);
    expect(shouldPauseForSpend({ ...base, running: false })).toBe(false);
    expect(shouldPauseForSpend({ ...base, costUsd: null })).toBe(false);
    expect(
      shouldPauseForSpend({
        ...base,
        approvals: [{ id: spendApprovalId(10) }],
      }),
    ).toBe(false);
  });

  it("does not let an approved spend checkpoint unlock building", async () => {
    const projectId = seedProject();
    const store = useModernizationStudioStore.getState();
    await dispatch("record_discovery", {
      components: [{ name: "UI", kind: "frontend", evidence: ["src/"] }],
    });
    await dispatch("set_plan", {
      steps: [{ id: "port", phase: "migrate", title: "Port" }],
    });
    store.requestApproval(projectId, {
      id: "spend-10",
      what: "Keep going past $10?",
      status: "approved",
      at: "2026-10-21T00:00:00Z",
    });
    const [refused] = await dispatch("update_progress", {
      step_id: "port",
      status: "active",
    });
    expect(refused).toMatchObject({ reason: "approval_required" });
  });
});

describe("studio transcript filter", () => {
  const message = (source: string, text: string) =>
    ({
      id: `${source}-${text.length}`,
      timestamp: "2026-10-21T00:00:00",
      source,
      llm_message: { role: "user", content: [{ type: "text", text }] },
      activated_microagents: [],
      extended_content: [],
    }) as unknown as Parameters<typeof isModernizationReceiptEvent>[0];

  it("hides receipts and runtime nudges, keeps what people wrote", () => {
    expect(
      isModernizationReceiptEvent(
        message("user", `${MODERNIZATION_RESULT_PREFIX}{"ok":true}`),
      ),
    ).toBe(true);
    expect(
      isModernizationReceiptEvent(
        message(
          "environment",
          "Your last response did not include a function call or a message.",
        ),
      ),
    ).toBe(true);
    expect(
      isModernizationReceiptEvent(message("user", "Keep the SQLite file")),
    ).toBe(false);
  });
});
