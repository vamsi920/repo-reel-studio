import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleModernizationControlAction,
  withNextStep,
  RECEIPT_NEXT_STEP,
  COMMAND_SHAPES,
} from "#/services/modernization-control";
import { MODERNIZATION_RESULT_PREFIX } from "#/constants/modernization-control";
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
    const [green] = await dispatch("update_progress", {
      step_id: "check",
      status: "done",
      stats: { parity_total: 42, parity_passing: 42 },
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
