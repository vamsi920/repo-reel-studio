import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  upsertError: null as { message: string } | null,
  insertError: null as { message: string } | null,
}));

vi.mock("#/lib/data-platform/client", () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: (table: string) => ({
      upsert: async () => {
        if (table !== "automation_metadata") {
          throw new Error(`unexpected table for upsert: ${table}`);
        }
        return { error: state.upsertError };
      },
      insert: async () => {
        if (table !== "proactivation_candidates") {
          throw new Error(`unexpected table for insert: ${table}`);
        }
        return { error: state.insertError };
      },
    }),
  },
}));

const { automationMetadataRepository } = await import(
  "#/lib/data-platform/repositories/automation-metadata-repository"
);

describe("automationMetadataRepository", () => {
  beforeEach(() => {
    state.upsertError = null;
    state.insertError = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("upsert", () => {
    it("resolves silently when the write succeeds", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await automationMetadataRepository.upsert({
        automationId: "automation-1",
        workspaceId: "workspace-1",
        proactivationConfig: { enabled: true },
      });

      expect(errorSpy).not.toHaveBeenCalled();
    });

    // Regression: a real write failure (RLS denial, constraint violation)
    // used to return exactly like success, with no console signal -- a
    // toggle would appear saved and then silently revert on next reload.
    it("logs when the upsert errors instead of swallowing the failure", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      state.upsertError = { message: "permission denied for table automation_metadata" };

      await automationMetadataRepository.upsert({
        automationId: "automation-1",
        workspaceId: "workspace-1",
      });

      expect(errorSpy).toHaveBeenCalledWith(
        "[automation-metadata-repository] upsert failed",
        state.upsertError,
      );
    });
  });

  describe("recordCandidate", () => {
    it("resolves silently when the write succeeds", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await automationMetadataRepository.recordCandidate({
        workspaceId: "workspace-1",
        title: "Candidate title",
      });

      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("logs when the insert errors instead of swallowing the failure", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      state.insertError = {
        message: "permission denied for table proactivation_candidates",
      };

      await automationMetadataRepository.recordCandidate({
        workspaceId: "workspace-1",
        title: "Candidate title",
      });

      expect(errorSpy).toHaveBeenCalledWith(
        "[automation-metadata-repository] recordCandidate failed",
        state.insertError,
      );
    });
  });
});
