import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyProfile } from "#/lib/environment/types/profile";

const state = vi.hoisted(() => ({
  data: null as Record<string, unknown> | null,
  error: null as { message: string } | null,
  // put()-specific: what an `.update(...).eq(...).eq(...).select(...)` chain
  // resolves to (null data = zero rows matched, i.e. a revision conflict)
  // and what an `.insert(...).select(...)` chain resolves to.
  updateResult: { data: null as Record<string, unknown> | null, error: null as { message: string; code?: string } | null },
  insertResult: { data: null as Record<string, unknown> | null, error: null as { message: string; code?: string } | null },
  updateCalls: [] as { orgId: string; revision: number }[],
  insertCalls: [] as { orgId: string }[],
}));

vi.mock("#/lib/data-platform/client", () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: state.data, error: state.error }),
        }),
      }),
      update: (_payload: unknown) => ({
        eq: (_col1: string, orgId: string) => ({
          eq: (_col2: string, revision: number) => ({
            select: () => ({
              maybeSingle: async () => {
                state.updateCalls.push({ orgId, revision });
                return state.updateResult;
              },
            }),
          }),
        }),
      }),
      insert: (row: { org_id: string }) => ({
        select: () => ({
          maybeSingle: async () => {
            state.insertCalls.push({ orgId: row.org_id });
            return state.insertResult;
          },
        }),
      }),
      upsert: async () => ({ error: null }),
    }),
  },
}));

const { environmentProfileRepository } = await import(
  "#/lib/data-platform/repositories/environment-profile-repository"
);

describe("environmentProfileRepository.get", () => {
  beforeEach(() => {
    state.data = null;
    state.error = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null immediately for an empty orgId, without querying", async () => {
    await expect(environmentProfileRepository.get("")).resolves.toBeNull();
  });

  it("returns null without logging when this org has never saved a profile", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.data = null;
    state.error = null;

    await expect(
      environmentProfileRepository.get("org-1"),
    ).resolves.toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("merges a stored doc over the default profile", async () => {
    state.data = {
      doc: { mode: "self-hosted", policy: { telemetry: false } },
      revision: 3,
      updated_at: "2026-09-01T00:00:00.000Z",
      updated_by: "user-1",
    };

    const result = await environmentProfileRepository.get("org-1");
    expect(result).toMatchObject({
      orgId: "org-1",
      mode: "self-hosted",
      policy: { telemetry: false },
      meta: { revision: 3, updatedBy: "user-1" },
    });
  });

  // Regression: a genuine fetch failure (RLS denial, network error) used to
  // return null identically to "this org has never saved a profile", with no
  // logging at all -- the same silent-swallow bug already fixed in
  // connections-repository.ts, github-connections-repository.ts,
  // jira-connections-repository.ts, and environment-checks-repository.ts.
  // Unlike those list-returning repos, a null here silently falls back
  // (in useEnvironmentProfile) to a fresh empty profile that an admin could
  // then unknowingly save over their real one, so the missing log here was
  // worse, not just inconsistent.
  it("logs and returns null when the query errors", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.data = null;
    state.error = { message: "permission denied for table environment_profiles" };

    await expect(
      environmentProfileRepository.get("org-1"),
    ).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      "[environment-profile-repository] get failed",
      state.error,
    );
  });
});

describe("environmentProfileRepository.put", () => {
  beforeEach(() => {
    state.updateResult = { data: null, error: null };
    state.insertResult = { data: null, error: null };
    state.updateCalls = [];
    state.insertCalls = [];
  });

  // Regression: a plain `upsert` here let a second admin's stale save
  // silently overwrite a first admin's newer one, since the row-level
  // revision trigger always accepts whatever `doc` it is given regardless of
  // what the caller thought the current revision was.
  it("updates by matching org_id AND the loaded revision, not org_id alone", async () => {
    state.updateResult = {
      data: { revision: 4, updated_at: "2026-09-02T00:00:00.000Z", updated_by: "user-2" },
      error: null,
    };
    const profile = { ...createEmptyProfile("org-1", "2026-09-01T00:00:00.000Z"), meta: { createdAt: "x", updatedAt: "x", updatedBy: "", revision: 3 } };

    const result = await environmentProfileRepository.put("org-1", profile);

    expect(state.updateCalls).toEqual([{ orgId: "org-1", revision: 3 }]);
    expect(state.insertCalls).toHaveLength(0);
    // Regression: put() used to echo back the caller's stale pre-write
    // revision (3) instead of the trigger-assigned one (4) -- the very next
    // save would then compute expectedRevision from 3, match zero rows
    // against the DB's real revision 4, and misreport a solo save as
    // "changed by someone else".
    expect(result.meta).toEqual({
      createdAt: "x",
      revision: 4,
      updatedAt: "2026-09-02T00:00:00.000Z",
      updatedBy: "user-2",
    });
  });

  it("throws a conflict error when the revision no longer matches (someone else saved first)", async () => {
    state.updateResult = { data: null, error: null };
    const profile = { ...createEmptyProfile("org-1", "2026-09-01T00:00:00.000Z"), meta: { createdAt: "x", updatedAt: "x", updatedBy: "", revision: 3 } };

    await expect(environmentProfileRepository.put("org-1", profile)).rejects.toThrow(
      /changed by someone else/,
    );
  });

  it("inserts (not upsert) for a brand-new profile, at revision 0", async () => {
    state.insertResult = {
      data: { revision: 1, updated_at: "2026-09-01T00:00:00.000Z", updated_by: "user-1" },
      error: null,
    };
    const profile = createEmptyProfile("org-1", "2026-09-01T00:00:00.000Z");
    expect(profile.meta.revision).toBe(0);

    const result = await environmentProfileRepository.put("org-1", profile);

    expect(state.insertCalls).toEqual([{ orgId: "org-1" }]);
    expect(state.updateCalls).toHaveLength(0);
    // Regression: without re-reading the trigger-assigned revision, the
    // returned profile stayed at revision 0 after its first-ever save,
    // so a second save immediately after would take the insert branch
    // again against a row that now exists and fail with a unique violation.
    expect(result.meta.revision).toBe(1);
  });

  it("throws a conflict error when two admins race to create the first profile", async () => {
    state.insertResult = { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } };
    const profile = createEmptyProfile("org-1", "2026-09-01T00:00:00.000Z");

    await expect(environmentProfileRepository.put("org-1", profile)).rejects.toThrow(
      /just created by someone else/,
    );
  });
});
