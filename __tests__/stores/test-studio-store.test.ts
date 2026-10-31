import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_LOG_ENTRIES,
  MAX_RUNS,
  latestReport,
  useTestStudioStore,
  type TestRun,
} from "#/stores/test-studio-store";
import { DEFAULT_GATES } from "#/lib/testing/gates";
import type { TestReport } from "#/lib/testing/model";

function run(id: string, withReport = true): TestRun {
  return {
    id,
    startedAt: "2026-10-30T10:00:00Z",
    finishedAt: "2026-10-30T10:01:00Z",
    status: "done",
    suiteIds: ["unit"],
    triggeredBy: "agent",
    progress: {},
    report: withReport
      ? ({
          runId: id,
          gates: { verdict: "passed", results: [] },
        } as unknown as TestReport)
      : undefined,
  };
}

describe("test studio store", () => {
  beforeEach(() => {
    useTestStudioStore.getState().reset();
  });

  it("creates a project with the default gates as the active one and round-trips its conversation", () => {
    const store = useTestStudioStore.getState();
    const project = store.createProject({
      name: "shop",
      source: { kind: "folder", name: "/work/shop" },
    });
    expect(useTestStudioStore.getState().activeProjectId).toBe(project.id);
    expect(project.gates).toEqual(DEFAULT_GATES);
    store.setConversationId(project.id, "c1");
    expect(
      useTestStudioStore.getState().projects[project.id].conversationId,
    ).toBe("c1");
    store.removeProject(project.id);
    expect(useTestStudioStore.getState().activeProjectId).toBeNull();
  });

  it("merges suites by id, replaces on request, and removes one", () => {
    const store = useTestStudioStore.getState();
    const { id } = store.createProject({
      name: "p",
      source: { kind: "folder", name: "/p" },
    });
    const suite = {
      id: "unit",
      kind: "unit" as const,
      name: "Unit",
      command: "a",
      results: [],
      origin: "existing" as const,
    };
    store.upsertSuites(id, [suite, { ...suite, id: "api", kind: "api" }]);
    store.upsertSuites(id, [{ ...suite, command: "b" }]);
    expect(
      useTestStudioStore
        .getState()
        .projects[id].plan.map((s) => [s.id, s.command]),
    ).toEqual([
      ["unit", "b"],
      ["api", "a"],
    ]);
    store.upsertSuites(id, [{ ...suite, id: "e2e", kind: "e2e" }], {
      replace: true,
    });
    expect(
      useTestStudioStore.getState().projects[id].plan.map((s) => s.id),
    ).toEqual(["e2e"]);
    store.removeSuite(id, "e2e");
    expect(useTestStudioStore.getState().projects[id].plan).toEqual([]);
  });

  it("answers a question once and keeps the answer", () => {
    const store = useTestStudioStore.getState();
    const { id } = store.createProject({
      name: "p",
      source: { kind: "folder", name: "/p" },
    });
    store.askQuestion(id, {
      id: "q1",
      title: "Which flows?",
      kind: "multi",
      options: [{ id: "a", label: "A" }],
      allowOther: true,
      status: "open",
      selected: [],
      at: "t",
    });
    const answered = store.answerQuestion(id, "q1", ["a"], "and B");
    expect(answered?.status).toBe("answered");
    expect(useTestStudioStore.getState().projects[id].questions[0]).toEqual(
      expect.objectContaining({ selected: ["a"], other: "and B" }),
    );
    expect(store.answerQuestion(id, "missing", [])).toBeNull();
  });

  it("keeps runs bounded, updates one in place, and finds the latest report", () => {
    const store = useTestStudioStore.getState();
    const { id } = store.createProject({
      name: "p",
      source: { kind: "folder", name: "/p" },
    });
    for (let i = 0; i < MAX_RUNS + 3; i += 1)
      store.addRun(id, run(`r${i}`, false));
    expect(useTestStudioStore.getState().projects[id].runs).toHaveLength(
      MAX_RUNS,
    );
    expect(
      latestReport(useTestStudioStore.getState().projects[id]),
    ).toBeUndefined();
    const updated = store.updateRun(id, `r${MAX_RUNS + 2}`, {
      report: run("x").report,
      status: "done",
    });
    expect(updated?.report?.runId).toBe("x");
    expect(
      latestReport(useTestStudioStore.getState().projects[id])?.runId,
    ).toBe("x");
  });

  it("upserts findings and changes their status; bounds the log; dedupes handled actions", () => {
    const store = useTestStudioStore.getState();
    const { id } = store.createProject({
      name: "p",
      source: { kind: "folder", name: "/p" },
    });
    const finding = {
      id: "f1",
      title: "Null deref",
      severity: "high" as const,
      kind: "unit" as const,
      description: "d",
      evidence: ["t"],
      status: "open" as const,
      at: "t",
    };
    store.upsertFindings(id, [finding]);
    store.upsertFindings(id, [{ ...finding, title: "Null deref in parser" }]);
    store.setFindingStatus(id, "f1", "fixed");
    expect(useTestStudioStore.getState().projects[id].findings).toEqual([
      expect.objectContaining({
        title: "Null deref in parser",
        status: "fixed",
      }),
    ]);
    for (let i = 0; i < MAX_LOG_ENTRIES + 5; i += 1)
      store.appendLog(id, { id: `l${i}`, level: "info", text: "x", at: "t" });
    expect(useTestStudioStore.getState().projects[id].log).toHaveLength(
      MAX_LOG_ENTRIES,
    );
    expect(store.markActionHandled(id, "a1")).toBe(true);
    expect(store.markActionHandled(id, "a1")).toBe(false);
  });

  it("marks the project done when a summary report is filed and records a schedule", () => {
    const store = useTestStudioStore.getState();
    const { id } = store.createProject({
      name: "p",
      source: { kind: "folder", name: "/p" },
    });
    store.setReport(id, {
      summary: "all green",
      artifacts: [".neotest/REPORT.md"],
      at: "t",
    });
    store.setSchedule(id, {
      automationId: "auto-1",
      name: "n",
      kind: "cron",
      description: "nightly",
      createdAt: "t",
    });
    const project = useTestStudioStore.getState().projects[id];
    expect(project.status).toBe("done");
    expect(project.schedule?.automationId).toBe("auto-1");
  });
});
