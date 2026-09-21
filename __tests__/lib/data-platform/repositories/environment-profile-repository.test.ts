import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  data: null as Record<string, unknown> | null,
  error: null as { message: string } | null,
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
