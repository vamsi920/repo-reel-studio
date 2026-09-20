import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  listData: null as Record<string, unknown>[] | null,
  listError: null as { message: string } | null,
  insertData: null as Record<string, unknown> | null,
  insertError: null as { message: string } | null,
  updateError: null as { message: string } | null,
  deleteError: null as { message: string } | null,
}));

vi.mock("#/lib/data-platform/client", () => ({
  isSupabaseConfigured: true,
  getAuthUser: async () => ({ data: { user: state.user } }),
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({
            data: state.listData,
            error: state.listError,
          }),
        }),
      }),
      insert: () => ({
        select: () => ({
          single: async () => ({
            data: state.insertData,
            error: state.insertError,
          }),
        }),
      }),
      update: () => ({
        eq: async () => ({ error: state.updateError }),
      }),
      delete: () => ({
        eq: async () => ({ error: state.deleteError }),
      }),
    }),
  },
}));

const { jiraTriggersRepository } = await import(
  "#/lib/data-platform/repositories/jira-triggers-repository"
);

describe("jiraTriggersRepository", () => {
  beforeEach(() => {
    state.user = { id: "user-1" };
    state.listData = [];
    state.listError = null;
    state.insertData = null;
    state.insertError = null;
    state.updateError = null;
    state.deleteError = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("listTriggers", () => {
    it("returns [] without logging when there are legitimately no rows", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      await expect(jiraTriggersRepository.listTriggers()).resolves.toEqual(
        [],
      );
      expect(errorSpy).not.toHaveBeenCalled();
    });

    // Regression: a genuine fetch failure (RLS denial, network error) used to
    // return [] identically to "no triggers configured", with no console
    // signal at all -- same class of bug already fixed in
    // connections-repository.ts and the jira/github connection repositories.
    it("logs and returns [] when the query errors", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      state.listError = { message: "permission denied" };

      await expect(jiraTriggersRepository.listTriggers()).resolves.toEqual(
        [],
      );
      expect(errorSpy).toHaveBeenCalledWith(
        "[jira-triggers-repository] listTriggers failed",
        state.listError,
      );
    });
  });

  describe("createTrigger", () => {
    const input = {
      projectKey: "NEOQA",
      readyStatus: "Ready for Development",
      repository: "vamsi920/neo-qa-fixture",
      automationId: "draft-1",
    };

    it("returns the created trigger on success", async () => {
      state.insertData = {
        id: "trigger-1",
        project_key: "NEOQA",
        label_filter: null,
        ready_status: "Ready for Development",
        repository: "vamsi920/neo-qa-fixture",
        branch: null,
        automation_id: "draft-1",
        enabled: true,
        created_at: "2026-09-01T00:00:00.000Z",
      };

      await expect(
        jiraTriggersRepository.createTrigger(input),
      ).resolves.toMatchObject({ id: "trigger-1", projectKey: "NEOQA" });
    });

    // Regression: this resolved to `null` on a Supabase query error without
    // ever throwing, so callers relying on a try/catch (connections-settings
    // .tsx's handleAdd) never saw the failure and showed a false success
    // toast.
    it("logs and returns null when the insert errors", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      state.insertError = { message: "permission denied" };

      await expect(
        jiraTriggersRepository.createTrigger(input),
      ).resolves.toBeNull();
      expect(errorSpy).toHaveBeenCalledWith(
        "[jira-triggers-repository] createTrigger failed",
        state.insertError,
      );
    });
  });

  describe("setEnabled", () => {
    it("returns true on success", async () => {
      await expect(
        jiraTriggersRepository.setEnabled("trigger-1", true),
      ).resolves.toBe(true);
    });

    it("logs and returns false when the update errors", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      state.updateError = { message: "permission denied" };

      await expect(
        jiraTriggersRepository.setEnabled("trigger-1", true),
      ).resolves.toBe(false);
      expect(errorSpy).toHaveBeenCalledWith(
        "[jira-triggers-repository] setEnabled failed",
        state.updateError,
      );
    });
  });

  describe("deleteTrigger", () => {
    it("returns true on success", async () => {
      await expect(
        jiraTriggersRepository.deleteTrigger("trigger-1"),
      ).resolves.toBe(true);
    });

    it("logs and returns false when the delete errors", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      state.deleteError = { message: "permission denied" };

      await expect(
        jiraTriggersRepository.deleteTrigger("trigger-1"),
      ).resolves.toBe(false);
      expect(errorSpy).toHaveBeenCalledWith(
        "[jira-triggers-repository] deleteTrigger failed",
        state.deleteError,
      );
    });
  });
});
