import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMMAND_SHAPES,
  RECEIPT_NEXT_STEP,
  completionBlockers,
  handleSynthControlAction,
  replayMissedSynthCommands,
  runGeneration,
  shouldAutoContinue,
  shouldContinueMidPlan,
  withNextStep,
} from "#/services/synth-control";
import { SYNTH_RESULT_PREFIX } from "#/constants/synth-control";
import { isSynthReceiptEvent } from "#/utils/synth-receipt";
import { getCachedRun, useSynthStudioStore } from "#/stores/synth-studio-store";
import type { SynthControlAction } from "#/types/agent-server/core";
import type { RunInWorkspace } from "#/lib/modernization/replay-harness";
import { PRISMA_SHOP } from "../lib/synth/fixtures";
import { clearDocumentCache, ingestDocument } from "#/services/synth-documents";

vi.mock(
  "#/api/conversation-service/agent-server-conversation-service.api",
  () => ({
    default: { sendMessage: vi.fn().mockResolvedValue(undefined) },
  }),
);

const CONVERSATION = "conv-synth";

function action(
  command: string,
  payload?: Record<string, unknown>,
): SynthControlAction {
  return {
    kind: "ClientAction_synth_control",
    command,
    payload: payload ?? null,
  } as unknown as SynthControlAction;
}

function parseReceipt(message: string): Record<string, unknown> {
  expect(message.startsWith(SYNTH_RESULT_PREFIX)).toBe(true);
  return JSON.parse(message.slice(SYNTH_RESULT_PREFIX.length));
}

/** A fake workspace: a Prisma schema on disk, writes recorded. */
function fakeWorkspace() {
  const written: string[] = [];
  const files: Record<string, string> = { "prisma/schema.prisma": PRISMA_SHOP };
  const run: RunInWorkspace = async (command) => {
    if (command.startsWith("find "))
      return { exit_code: 0, stdout: "./prisma/schema.prisma\n" };
    const read = command.match(
      /^test -f '([^']+)' && head -c \d+ '[^']+' \| base64/,
    );
    if (read) {
      const content = files[read[1]];
      return content === undefined
        ? { exit_code: 0, stdout: "" }
        : {
            exit_code: 0,
            stdout: Buffer.from(content, "utf8").toString("base64"),
          };
    }
    if (command.startsWith("mkdir ")) return { exit_code: 0, stdout: "" };
    const write = command.match(/base64 -d >>? (\S+)$/);
    if (write) {
      if (!written.includes(write[1])) written.push(write[1]);
      return { exit_code: 0, stdout: "" };
    }
    return { exit_code: 0, stdout: "" };
  };
  return { run, written };
}

async function dispatch(
  command: string,
  payload?: Record<string, unknown>,
  runInWorkspace?: RunInWorkspace,
) {
  const postResult = vi.fn();
  await handleSynthControlAction(action(command, payload), {
    postResult,
    conversationId: CONVERSATION,
    runInWorkspace,
    now: () => Date.parse("2026-10-21T12:00:00Z"),
  });
  return postResult.mock.calls.map((call) => parseReceipt(call[0] as string));
}

function seedProject() {
  const store = useSynthStudioStore.getState();
  store.reset();
  const project = store.createProject({
    name: "shop",
    source: { kind: "repository", name: "acme/shop", branch: "main" },
  });
  store.setConversationId(project.id, CONVERSATION);
  return project.id;
}

const USERS_ENTITY = {
  name: "User",
  table: "users",
  evidence: ["src/models/user.py"],
  fields: [
    { name: "id", type: "integer", primary_key: true },
    { name: "email", type: "varchar(255)", unique: true },
    { name: "role", type: "string", enum_values: ["admin", "member"] },
    { name: "created_at", type: "timestamptz" },
  ],
};
const ORDERS_ENTITY = {
  name: "Order",
  evidence: ["src/models/order.py"],
  fields: [
    { name: "id", type: "integer", primary_key: true },
    { name: "user_id", type: "integer", references: "user.id" },
    {
      name: "status",
      type: "string",
      enum_values: ["pending", "paid", "shipped"],
    },
    { name: "total_cents", type: "integer", min: 0 },
    { name: "shipped_at", type: "datetime", nullable: true },
  ],
};

describe("synth_control dispatcher", () => {
  let projectId: string;
  beforeEach(() => {
    projectId = seedProject();
  });

  it("rejects unknown commands with the valid list, and rejects when no project owns the conversation", async () => {
    const [unknown] = await dispatch("explode");
    expect(unknown.status).toBe("rejected");
    expect(unknown.valid_commands).toContain("describe");
    useSynthStudioStore.getState().reset();
    const [orphan] = await dispatch("describe");
    expect(orphan).toMatchObject({ status: "rejected", reason: "no_project" });
  });

  it("describe returns the project, shapes, built-in scenarios and the schema files it found", async () => {
    const { run } = fakeWorkspace();
    const [r] = await dispatch("describe", undefined, run);
    expect(r.status).toBe("ok");
    expect(r.resumed).toBe(false);
    expect(r.commands).toEqual(COMMAND_SHAPES);
    expect(r.schema_files_found).toEqual(["prisma/schema.prisma"]);
    expect((r.scenarios as { id: string }[]).map((s) => s.id)).toEqual([
      "smoke",
      "realistic",
      "edge_cases",
      "load",
    ]);
    expect(r.completion_blockers).toEqual([
      "no_entities",
      "no_valid_run",
      "no_verified_run",
    ]);
  });

  it("import_schema parses workspace files into the model and needs a runtime", async () => {
    const [noRuntime] = await dispatch("import_schema", {
      paths: ["prisma/schema.prisma"],
    });
    expect(noRuntime).toMatchObject({
      status: "rejected",
      reason: "no_runtime",
    });
    const { run } = fakeWorkspace();
    const [r] = await dispatch(
      "import_schema",
      { paths: ["prisma/schema.prisma", "missing.sql"] },
      run,
    );
    expect(r.status).toBe("ok");
    expect(r.entities_total).toBe(6);
    expect(r.model_problems).toEqual([]);
    const imported = r.imported as {
      path: string;
      error?: string;
      entities?: string[];
    }[];
    expect(imported[0].entities).toContain("order_item");
    expect(imported[1].error).toBe("not_found_or_unreadable");
    expect(useSynthStudioStore.getState().projects[projectId].status).toBe(
      "modeling",
    );
  });

  it("record_model normalises types, references and enums, merges by id, and refuses secrets", async () => {
    const [r] = await dispatch("record_model", {
      entities: [USERS_ENTITY, ORDERS_ENTITY],
    });
    expect(r).toMatchObject({
      status: "ok",
      recorded: ["user", "order"],
      entities_total: 2,
      model_problems: [],
    });
    const model = useSynthStudioStore.getState().projects[projectId].model;
    const user = model.entities.find((e) => e.id === "user")!;
    expect(user.fields.find((f) => f.name === "email")).toMatchObject({
      type: "string",
      unique: true,
      semantic: "email",
    });
    expect(user.fields.find((f) => f.name === "role")).toMatchObject({
      type: "enum",
      enumValues: ["admin", "member"],
    });
    expect(user.fields.find((f) => f.name === "created_at")?.type).toBe(
      "datetime",
    );
    const order = model.entities.find((e) => e.id === "order")!;
    expect(order.fields.find((f) => f.name === "user_id")?.references).toEqual({
      entity: "user",
      field: "id",
    });

    // A later mention adds a field without erasing the earlier ones.
    const [again] = await dispatch("record_model", {
      entities: [
        {
          name: "User",
          fields: [{ name: "phone", type: "string", nullable: true }],
        },
      ],
    });
    expect(again.status).toBe("ok");
    const merged = useSynthStudioStore
      .getState()
      .projects[projectId].model.entities.find((e) => e.id === "user")!;
    expect(merged.fields.map((f) => f.name)).toEqual([
      "id",
      "email",
      "role",
      "created_at",
      "phone",
    ]);

    const [secret] = await dispatch("record_model", {
      entities: [
        {
          name: "Cfg",
          fields: [
            {
              name: "token",
              type: "string",
              description: "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
            },
          ],
        },
      ],
    });
    expect(secret).toMatchObject({
      status: "rejected",
      reason: "looks_like_credential",
    });
    const [empty] = await dispatch("record_model", {
      entities: [{ name: "Nothing" }],
    });
    expect(empty).toMatchObject({ status: "rejected", reason: "no_entities" });
  });

  it("record_rules / record_flows / record_profile validate against the model", async () => {
    await dispatch("record_model", { entities: [USERS_ENTITY, ORDERS_ENTITY] });
    const [rules] = await dispatch("record_rules", {
      rules: [
        {
          entity: "order",
          description: "shipped orders have shipped_at",
          spec: {
            kind: "implies",
            if: { field: "status", in: ["shipped"] },
            then: { field: "shipped_at", isNull: false },
          },
        },
        {
          entity: "order",
          description: "bad field",
          spec: { kind: "range", field: "nope", min: 0 },
        },
        {
          entity: "ghost",
          description: "bad entity",
          spec: { kind: "range", field: "x" },
        },
      ],
    });
    expect(rules.status).toBe("ok");
    expect(rules.recorded).toHaveLength(1);
    expect(rules.invalid).toHaveLength(2);

    const [flows] = await dispatch("record_flows", {
      flows: [
        {
          name: "Checkout",
          from: "POST /checkout",
          to: "orders table",
          via: "HTTP",
          entities: ["order", "user", "unknown"],
        },
      ],
    });
    expect(flows).toMatchObject({ status: "ok", recorded: ["checkout"] });
    expect(
      useSynthStudioStore.getState().projects[projectId].model.flows[0]
        .entities,
    ).toEqual(["order", "user"]);

    const [profile] = await dispatch("record_profile", {
      entity: "order",
      field: "status",
      distribution: {
        kind: "categorical",
        weights: { paid: 70, pending: 20, shipped: 10 },
      },
    });
    expect(profile).toMatchObject({ status: "ok", kind: "categorical" });
    const [personal] = await dispatch("record_profile", {
      entity: "user",
      field: "email",
      distribution: { kind: "categorical", weights: { "someone@corp.com": 3 } },
    });
    expect(personal).toMatchObject({
      status: "rejected",
      reason: "labels_look_personal",
    });
    const [unknownField] = await dispatch("record_profile", {
      entity: "user",
      field: "zzz",
      distribution: { kind: "null_rate", rate: 0.5 },
    });
    expect(unknownField).toMatchObject({
      status: "rejected",
      reason: "unknown_field",
    });
  });

  it("ask_choice renders a card and waits; the answer is posted by the UI", async () => {
    const [r] = await dispatch("ask_choice", {
      question_id: "purpose",
      title: "What is the data for?",
      options: [
        { id: "tests", label: "Automated tests", recommended: true },
        { id: "demo", label: "Demo" },
      ],
    });
    expect(r).toMatchObject({ status: "pending_user", question_id: "purpose" });
    const project = useSynthStudioStore.getState().projects[projectId];
    expect(project.status).toBe("interviewing");
    expect(project.questions[0].options[0].recommended).toBe(true);
    const [bad] = await dispatch("ask_choice", { title: "no options" });
    expect(bad).toMatchObject({ status: "rejected", reason: "no_options" });
    useSynthStudioStore
      .getState()
      .answerQuestion(projectId, "purpose", ["demo"]);
    const [again] = await dispatch("ask_choice", {
      question_id: "purpose",
      title: "again?",
      options: [{ id: "x", label: "X" }],
    });
    expect(again).toMatchObject({
      status: "answered",
      question_id: "purpose",
      selected: ["demo"],
    });
    expect(
      useSynthStudioStore.getState().projects[projectId].questions[0].status,
    ).toBe("answered");
  });

  it("generate refuses an invalid model, then generates, validates, writes and reports; report_verification and complete are gated", async () => {
    const { run, written } = fakeWorkspace();
    const [noModel] = await dispatch("generate", {}, run);
    expect(noModel).toMatchObject({
      status: "rejected",
      reason: "model_invalid",
    });

    await dispatch("record_model", { entities: [USERS_ENTITY, ORDERS_ENTITY] });
    await dispatch("record_rules", {
      rules: [
        {
          entity: "order",
          description: "shipped has date",
          spec: {
            kind: "implies",
            if: { field: "status", in: ["shipped"] },
            then: { field: "shipped_at", isNull: false },
          },
        },
      ],
    });
    const [unknownScenario] = await dispatch(
      "generate",
      { scenario_id: "nope" },
      run,
    );
    expect(unknownScenario).toMatchObject({
      status: "rejected",
      reason: "unknown_scenario",
    });

    const [set] = await dispatch("set_scenarios", {
      scenarios: [
        {
          id: "churn",
          name: "Churn",
          counts: { user: 30, order: 90 },
          overrides: [
            { entity: "order", field: "status", values: ["shipped"] },
          ],
        },
      ],
    });
    expect(set.status).toBe("ok");
    const [gen] = await dispatch(
      "generate",
      { scenario_id: "churn", seed: 7, formats: ["json", "sql_postgres"] },
      run,
    );
    expect(gen.status).toBe("ok");
    expect(gen.rows_total).toBe(120);
    expect(gen.validation).toMatchObject({ ok: true });
    expect(gen.dir).toMatch(/^synthetic-data\/run_/);
    expect(written.some((p) => p.endsWith("/seed.postgres.sql"))).toBe(true);
    expect(written.some((p) => p.endsWith("/manifest.json"))).toBe(true);
    expect(written.some((p) => p.endsWith("/privacy-report.md"))).toBe(true);
    const runId = gen.run_id as string;
    const project = useSynthStudioStore.getState().projects[projectId];
    expect(project.runs[0]).toMatchObject({
      id: runId,
      seed: 7,
      triggeredBy: "agent",
      rowsTotal: 120,
    });
    expect(project.runs[0].preview.order.length).toBeLessThanOrEqual(8);
    expect(
      getCachedRun(runId)?.dataset.tables.order.every(
        (r) => r.status === "shipped" && r.shipped_at !== null,
      ),
    ).toBe(true);
    expect(project.status).toBe("ready");

    const [tooEarly] = await dispatch("complete", { summary: "done" });
    expect(tooEarly).toMatchObject({
      status: "rejected",
      reason: "verification_required",
    });
    expect(tooEarly.missing).toEqual(["no_verified_run"]);

    const [nothing] = await dispatch("report_verification", { run_id: runId });
    expect(nothing).toMatchObject({
      status: "rejected",
      reason: "nothing_verified",
    });
    const [badTests] = await dispatch("report_verification", {
      run_id: runId,
      tests_total: 3,
      tests_passing: 4,
    });
    expect(badTests).toMatchObject({
      status: "rejected",
      reason: "tests_passing_exceeds_total",
    });
    const [failing] = await dispatch("report_verification", {
      run_id: runId,
      tests_total: 3,
      tests_passing: 2,
    });
    expect(failing).toMatchObject({ status: "ok", verified: false });
    const [verified] = await dispatch("report_verification", {
      run_id: runId,
      loaded_into: "postgres shop_test",
      rows_loaded: 120,
      tests_total: 3,
      tests_passing: 3,
    });
    expect(verified).toMatchObject({ status: "ok", verified: true });
    expect(
      completionBlockers(useSynthStudioStore.getState().projects[projectId]),
    ).toEqual([]);

    const [done] = await dispatch("complete", {
      summary: "120 rows, loaded and tested",
      artifacts: ["synthetic-data"],
    });
    expect(done).toMatchObject({ status: "ok", completed: true });
    expect(useSynthStudioStore.getState().projects[projectId].status).toBe(
      "done",
    );
  });

  it("runGeneration from the UI records a user-triggered run even without a runtime", async () => {
    await dispatch("record_model", { entities: [USERS_ENTITY, ORDERS_ENTITY] });
    const outcome = await runGeneration(
      projectId,
      { scenarioId: "smoke", seed: "abc" },
      { triggeredBy: "user" },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.run.triggeredBy).toBe("user");
    expect(outcome.run.workspaceDir).toBeUndefined();
    expect(outcome.run.writtenFiles).toEqual([]);
    expect(
      getCachedRun(outcome.run.id)?.files.some(
        (f) => f.path === "seed.postgres.sql",
      ),
    ).toBe(true);
  });

  it("log appends without a receipt; receipts carry the next-step nudge and are hidden from the transcript", async () => {
    const receipts = await dispatch("log", {
      text: "reading models",
      level: "info",
    });
    expect(receipts).toEqual([]);
    expect(useSynthStudioStore.getState().projects[projectId].log[0].text).toBe(
      "reading models",
    );
    const nudged = withNextStep(`${SYNTH_RESULT_PREFIX}{"status":"ok"}`);
    expect(JSON.parse(nudged.slice(SYNTH_RESULT_PREFIX.length)).next).toBe(
      RECEIPT_NEXT_STEP,
    );
    expect(withNextStep("plain")).toBe("plain");
    const event = {
      id: "e1",
      kind: "MessageEvent",
      source: "user",
      timestamp: "2026-10-21T12:00:00Z",
      llm_message: {
        role: "user",
        content: [
          { type: "text", text: `${SYNTH_RESULT_PREFIX}{"status":"ok"}` },
        ],
      },
    } as never;
    expect(isSynthReceiptEvent(event)).toBe(true);
  });

  it("auto-continue fires once per answered receipt and never while a card is open", () => {
    const base = {
      agentIdle: true,
      lastReceiptAt: 1000,
      nudgedForReceiptAt: null,
      now: 2000,
    };
    const idle = { status: "ready" as const, questions: [] };
    expect(shouldAutoContinue({ ...base, project: idle })).toBe(true);
    expect(
      shouldAutoContinue({ ...base, nudgedForReceiptAt: 1000, project: idle }),
    ).toBe(false);
    expect(
      shouldAutoContinue({ ...base, agentIdle: false, project: idle }),
    ).toBe(false);
    expect(
      shouldAutoContinue({ ...base, now: 1000 + 121_000, project: idle }),
    ).toBe(false);
    expect(
      shouldAutoContinue({
        ...base,
        project: { status: "ready", questions: [{ status: "open" } as never] },
      }),
    ).toBe(false);
    expect(
      shouldAutoContinue({
        ...base,
        project: { status: "done", questions: [] },
      }),
    ).toBe(false);
  });

  it("mid-plan nudge fires once per idle period while the dataset is incomplete, not on questions, not after giving up", async () => {
    await dispatch("record_model", { entities: [USERS_ENTITY, ORDERS_ENTITY] });
    const project = useSynthStudioStore.getState().projects[projectId];
    const base = {
      agentIdle: true,
      idleAt: 10,
      nudgedForIdleAt: null,
      nudgesWithoutProgress: 0,
      lastAgentText: "Importing the schema now.",
      project,
    };
    expect(shouldContinueMidPlan(base)).toBe(true);
    expect(shouldContinueMidPlan({ ...base, nudgedForIdleAt: 10 })).toBe(false);
    expect(shouldContinueMidPlan({ ...base, nudgesWithoutProgress: 3 })).toBe(
      false,
    );
    expect(
      shouldContinueMidPlan({
        ...base,
        lastAgentText: "Which database do you use?",
      }),
    ).toBe(false);
    expect(shouldContinueMidPlan({ ...base, agentIdle: false })).toBe(false);
    expect(
      shouldContinueMidPlan({
        ...base,
        project: { ...project, status: "done" },
      }),
    ).toBe(false);
    expect(
      shouldContinueMidPlan({
        ...base,
        project: { ...project, questions: [{ status: "open" } as never] },
      }),
    ).toBe(false);
  });

  it("dispatches an action id at most once and replays unhandled commands from history (generate rejected, log skipped)", async () => {
    const postResult = vi.fn();
    const ctx = { postResult, conversationId: CONVERSATION };
    await handleSynthControlAction(
      action("record_model", { entities: [USERS_ENTITY] }),
      { ...ctx, actionId: "a1" },
    );
    await handleSynthControlAction(
      action("record_model", { entities: [USERS_ENTITY] }),
      { ...ctx, actionId: "a1" },
    );
    expect(postResult).toHaveBeenCalledTimes(1);

    const mk = (
      id: string,
      command: string,
      payload: Record<string, unknown>,
    ) =>
      ({
        id,
        kind: "ActionEvent",
        source: "agent",
        timestamp: "2026-10-21T12:00:00Z",
        tool_name: "synth_control",
        tool_call_id: id,
        action: { kind: "ClientAction_synth_control", command, payload },
      }) as never;
    postResult.mockClear();
    const replayed = await replayMissedSynthCommands(
      [
        mk("a1", "record_model", { entities: [USERS_ENTITY] }),
        mk("a2", "log", { text: "x" }),
        mk("a3", "record_model", { entities: [ORDERS_ENTITY] }),
        mk("a4", "generate", { scenario_id: "smoke" }),
        {
          id: "m1",
          kind: "MessageEvent",
          source: "user",
          llm_message: { role: "user", content: [] },
        } as never,
      ],
      ctx,
    );
    expect(replayed).toEqual(["a3", "a4"]);
    const receipts = postResult.mock.calls.map((c) =>
      parseReceipt(c[0] as string),
    );
    expect(receipts[0]).toMatchObject({ status: "ok", recorded: ["order"] });
    expect(receipts[1]).toMatchObject({
      status: "rejected",
      reason: "studio_was_away",
    });
    expect(
      useSynthStudioStore.getState().projects[projectId].handledActionIds,
    ).toEqual(["a1", "a2", "a3", "a4"]);
    // A second pass finds nothing new.
    expect(
      await replayMissedSynthCommands([mk("a3", "record_model", {})], ctx),
    ).toEqual([]);
  });

  it("record_model carries privacy choices and column context; describe lists pending privacy decisions; generate honours total_rows", async () => {
    const [r] = await dispatch("record_model", {
      entities: [
        {
          name: "Member",
          fields: [
            { name: "id", type: "integer", primary_key: true },
            { name: "ssn", type: "string" },
            { name: "card_number", type: "string", treatment: "mask" },
            { name: "nickname", type: "string", pii: false },
            {
              name: "lvl",
              type: "string",
              context: "membership level",
              examples: ["gold", " silver ", ""],
            },
            { name: "bad", type: "string", treatment: "shred", pii: "maybe" },
          ],
        },
      ],
    });
    expect(r.status).toBe("ok");
    const member =
      useSynthStudioStore.getState().projects[projectId].model.entities[0];
    const field = (name: string) => member.fields.find((f) => f.name === name)!;
    expect(field("card_number").treatment).toBe("mask");
    expect(field("nickname").pii).toBe("none");
    expect(field("lvl")).toMatchObject({
      context: "membership level",
      examples: ["gold", "silver"],
    });
    expect(field("bad").treatment).toBeUndefined();
    expect(field("bad").pii).toBeUndefined();

    const [d] = await dispatch("describe");
    const model = d.model as {
      privacy: { decisions_pending: string[] };
      entities: { column_context: unknown[] }[];
    };
    expect(model.privacy.decisions_pending).toEqual(["member.ssn (ssn)"]);
    expect(model.entities[0].column_context).toEqual([
      {
        field: "lvl",
        context: "membership level",
        examples: ["gold", "silver"],
      },
    ]);

    const [g] = await dispatch("generate", {
      scenario_id: "smoke",
      seed: 1,
      total_rows: 37,
      write: false,
    });
    expect(g).toMatchObject({ status: "ok", rows_total: 37 });
    const run = useSynthStudioStore.getState().projects[projectId].runs[0];
    expect(
      run.preview.member.every((row) =>
        /^\*{12}\d{4}$|^\*{11}\d{4}$/.test(String(row.card_number)),
      ),
    ).toBe(true);
    expect(
      run.preview.member.every((row) =>
        ["gold", "silver"].includes(String(row.lvl)),
      ),
    ).toBe(true);
  });
});

describe("document projects", () => {
  const BRD = [
    "# Loans BRD",
    "",
    "BR-1: The system shall capture the following details for each customer: full name, email address and date of birth.",
    "BR-2: Each customer can have many loans.",
    "BR-3: The loan amount must be between 500 and 50,000.",
    "BR-4: Loan status can be Open, Closed or Defaulted.",
    "BR-5: A defaulted loan is handed to the collections team within 30 days.",
    "Contact for questions: jane.doe@gmail.com",
  ].join("\n");
  let projectId: string;

  beforeEach(() => {
    const store = useSynthStudioStore.getState();
    store.reset();
    clearDocumentCache();
    projectId = store.createProject({
      name: "loans",
      source: { kind: "document", name: "loans-brd.md" },
    }).id;
    store.setConversationId(projectId, CONVERSATION);
  });

  it("builds the model from a document before any runtime exists, then hands the agent the scrubbed text", async () => {
    const outcome = await ingestDocument(
      projectId,
      { name: "loans-brd.md", bytes: new TextEncoder().encode(BRD) },
      { addedBy: "user" },
    );
    expect(outcome.ok).toBe(true);
    const project = useSynthStudioStore.getState().projects[projectId];
    expect(project.model.entities.map((e) => e.id).sort()).toEqual([
      "customer",
      "loan",
    ]);
    expect(project.status).toBe("modeling");
    expect(project.documents[0]).toMatchObject({
      workspacePath: null,
      personalValuesRemoved: 1,
    });

    const ws = fakeWorkspace();
    const [described] = await dispatch("describe", {}, ws.run);
    const docDir = `synth-input/${projectId}`;
    expect(ws.written).toContain(`'${docDir}/loans_brd.md'`);
    expect(described.documents).toEqual([
      expect.objectContaining({
        id: "loans_brd",
        path: `${docDir}/loans_brd.md`,
        text_available: true,
      }),
    ]);
    // BR-5 talks about loans but nothing in the model expresses it yet.
    const requirements = described.requirements as {
      uncovered: { id: string }[];
      covered: number;
      data: number;
    };
    expect(requirements.uncovered.map((r) => r.id)).toEqual(["BR-5"]);

    const [chunk] = await dispatch("describe", { document_id: "loans_brd" });
    const text = (chunk.document_text as { text: string }).text;
    expect(text).toContain("BR-3");
    expect(text).not.toContain("jane.doe@gmail.com");
  });

  it("counts a requirement covered once the agent cites it", async () => {
    await ingestDocument(
      projectId,
      { name: "loans-brd.md", bytes: new TextEncoder().encode(BRD) },
      { addedBy: "user" },
    );
    await dispatch("record_rules", {
      rules: [
        {
          entity: "loan",
          description:
            "Defaulted loans go to collections within 30 days (not generated).",
          evidence: ["loans-brd.md BR-5"],
          spec: { kind: "range", field: "amount", min: 500, max: 50000 },
        },
      ],
    });
    const [described] = await dispatch("describe");
    const requirements = described.requirements as {
      uncovered: unknown[];
      covered: number;
      data: number;
    };
    expect(requirements.uncovered).toEqual([]);
    expect(requirements.covered).toBe(requirements.data);
  });

  it("import_schema reads requirement documents from the workspace and keeps originals it cannot read", async () => {
    const ws = fakeWorkspace();
    const files: Record<string, string> = {
      "docs/Loans BRD.md": BRD,
      "docs/scan.pdf": "%PDF-1.4\n%%EOF",
    };
    const run: RunInWorkspace = async (command) => {
      const read = command.match(
        /^test -f '([^']+)' && head -c \d+ '[^']+' \| base64/,
      );
      if (read && files[read[1]] !== undefined) {
        return {
          exit_code: 0,
          stdout: Buffer.from(files[read[1]], "utf8").toString("base64"),
        };
      }
      return ws.run(command);
    };
    const [receiptBody] = await dispatch(
      "import_schema",
      { paths: ["docs/Loans BRD.md", "docs/scan.pdf"] },
      run,
    );
    expect(receiptBody.status).toBe("ok");
    const imported = receiptBody.imported as Record<string, unknown>[];
    expect(imported[0]).toMatchObject({
      document_id: "loans_brd",
      entities: ["customer", "loan"],
    });
    expect(imported[1]).toMatchObject({ document_id: "scan", entities: [] });
    const project = useSynthStudioStore.getState().projects[projectId];
    const scan = project.documents.find((d) => d.id === "scan")!;
    expect(scan).toMatchObject({ unreadable: true, addedBy: "agent" });
    expect(scan.originalPath).toBe(
      `synth-input/${projectId}/scan.original.pdf`,
    );
    expect(ws.written).toContain(
      `'synth-input/${projectId}/scan.original.pdf'`,
    );
  });

  it("refuses files it cannot read at all", async () => {
    const outcome = await ingestDocument(
      projectId,
      { name: "broken.docx", bytes: new TextEncoder().encode("not a zip") },
      { addedBy: "user" },
    );
    expect(outcome).toMatchObject({ ok: false });
    expect(
      useSynthStudioStore.getState().projects[projectId].documents,
    ).toEqual([]);
  });
});
