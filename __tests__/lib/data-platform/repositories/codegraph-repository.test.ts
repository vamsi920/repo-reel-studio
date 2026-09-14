import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface QueryResult {
  data: unknown;
  error: unknown;
}

const state = vi.hoisted(() => ({
  result: { data: null, error: null } as QueryResult,
  throwOnQuery: null as Error | null,
}));

vi.mock("#/lib/data-platform/client", () => {
  function chain() {
    // Mimics postgrest-js's chainable, thenable query builder: every
    // intermediate call returns the same object; maybeSingle() and a direct
    // await (upsert) both resolve to the configured { data, error }.
    const obj: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order", "limit"]) {
      obj[method] = () => obj;
    }
    const settle = () =>
      state.throwOnQuery
        ? Promise.reject(state.throwOnQuery)
        : Promise.resolve(state.result);
    obj.maybeSingle = settle;
    obj.upsert = settle;
    return obj;
  }

  return {
    isSupabaseConfigured: true,
    supabase: { from: () => chain() },
  };
});

const { codegraphPersistenceRepository } =
  await import("#/lib/data-platform/repositories/codegraph-repository");

// supabase-js does not throw on a fetch failure unless throwOnError() is
// set; it resolves { data: null, error } -- which used to be swallowed as a
// plain "no snapshot" answer.
const FETCH_FAILURE = { message: "TypeError: Failed to fetch" };

describe("codegraphPersistenceRepository", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    state.result = { data: null, error: null };
    state.throwOnQuery = null;
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("findSnapshotWorkspaceId", () => {
    it("returns null without logging when there is legitimately no snapshot", async () => {
      await expect(
        codegraphPersistenceRepository.findSnapshotWorkspaceId("repo-1", "abc"),
      ).resolves.toBeNull();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("returns the stored workspace id when a row exists", async () => {
      state.result = { data: { workspace_id: "ws-1" }, error: null };
      await expect(
        codegraphPersistenceRepository.findSnapshotWorkspaceId("repo-1", "abc"),
      ).resolves.toBe("ws-1");
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("logs a resolved query error instead of silently returning null", async () => {
      state.result = { data: null, error: FETCH_FAILURE };
      await expect(
        codegraphPersistenceRepository.findSnapshotWorkspaceId("repo-1", "abc"),
      ).resolves.toBeNull();
      expect(errorSpy).toHaveBeenCalledWith(
        "[codegraph-persistence] codegraph_snapshots workspace lookup failed",
        FETCH_FAILURE,
      );
    });

    it("logs a thrown error instead of swallowing it", async () => {
      state.throwOnQuery = new Error("boom");
      await expect(
        codegraphPersistenceRepository.findSnapshotWorkspaceId("repo-1", "abc"),
      ).resolves.toBeNull();
      expect(errorSpy).toHaveBeenCalledWith(
        "[codegraph-persistence] codegraph_snapshots workspace lookup failed",
        state.throwOnQuery,
      );
    });
  });

  describe("hasSnapshot", () => {
    it("returns false without logging when there is no row", async () => {
      await expect(
        codegraphPersistenceRepository.hasSnapshot("ws-1", "repo-1", "abc"),
      ).resolves.toBe(false);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("logs a resolved query error", async () => {
      state.result = { data: null, error: FETCH_FAILURE };
      await expect(
        codegraphPersistenceRepository.hasSnapshot("ws-1", "repo-1", "abc"),
      ).resolves.toBe(false);
      expect(errorSpy).toHaveBeenCalledWith(
        "[codegraph-persistence] codegraph_snapshots lookup failed",
        FETCH_FAILURE,
      );
    });
  });

  describe("saveSnapshot", () => {
    const INPUT = {
      workspaceId: "ws-1",
      repositoryUuid: "repo-1",
      commitSha: "abc",
      nodeCount: 1,
      edgeCount: 0,
      analyzerVersion: "understand-anything",
      outputPath: "ws-1/repo-1/abc",
    };

    it("logs a failed upsert and still resolves", async () => {
      state.result = { data: null, error: FETCH_FAILURE };
      await expect(
        codegraphPersistenceRepository.saveSnapshot(INPUT),
      ).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith(
        "[codegraph-persistence] codegraph_snapshots upsert failed",
        FETCH_FAILURE,
      );
    });

    it("does not log on a successful upsert", async () => {
      await codegraphPersistenceRepository.saveSnapshot(INPUT);
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });
});
