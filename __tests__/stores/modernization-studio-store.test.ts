import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_LOG_ENTRIES,
  planProgress,
  useModernizationStudioStore,
} from "#/stores/modernization-studio-store";

describe("modernization studio store", () => {
  beforeEach(() => {
    useModernizationStudioStore.getState().reset();
  });

  it("creates a project as the active one and round-trips its conversation id", () => {
    const store = useModernizationStudioStore.getState();
    const project = store.createProject({
      name: "shop",
      source: { kind: "folder", name: "/work/shop" },
    });
    expect(useModernizationStudioStore.getState().activeProjectId).toBe(
      project.id,
    );
    store.setConversationId(project.id, "c1");
    expect(
      useModernizationStudioStore.getState().projects[project.id]
        .conversationId,
    ).toBe("c1");
    store.removeProject(project.id);
    expect(useModernizationStudioStore.getState().activeProjectId).toBeNull();
  });

  it("weights plan progress and ignores skipped steps", () => {
    expect(
      planProgress([
        { id: "a", phase: "specify", title: "a", status: "done", weight: 1 },
        { id: "b", phase: "migrate", title: "b", status: "pending", weight: 3 },
        { id: "c", phase: "verify", title: "c", status: "skipped" },
      ]),
    ).toEqual({ done: 1, total: 4, ratio: 0.25 });
    expect(planProgress([])).toEqual({ done: 0, total: 0, ratio: 0 });
  });

  it("re-asking a question replaces it, and the log stays bounded", () => {
    const store = useModernizationStudioStore.getState();
    const { id } = store.createProject({
      name: "shop",
      source: { kind: "folder", name: "/work/shop" },
    });
    const base = {
      id: "q1",
      title: "Target?",
      kind: "single" as const,
      allowOther: true,
      status: "open" as const,
      selected: [],
      at: "2026-10-20T00:00:00Z",
    };
    store.askQuestion(id, { ...base, options: [{ id: "a", label: "A" }] });
    store.askQuestion(id, { ...base, options: [{ id: "b", label: "B" }] });
    const project = () => useModernizationStudioStore.getState().projects[id];
    expect(project().questions).toHaveLength(1);
    expect(project().questions[0].options[0].id).toBe("b");

    for (let i = 0; i < MAX_LOG_ENTRIES + 25; i++) {
      store.appendLog(id, {
        id: `l${i}`,
        level: "info",
        text: `${i}`,
        at: "t",
      });
    }
    expect(project().log).toHaveLength(MAX_LOG_ENTRIES);
    expect(project().log[0].text).toBe("25");
  });
});
