import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  data: null as Record<string, unknown>[] | null,
  error: null as { message: string } | null,
}));

vi.mock("#/lib/data-platform/client", () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({ data: state.data, error: state.error }),
          }),
        }),
      }),
    }),
  },
}));

const { environmentChecksRepository } = await import(
  "#/lib/data-platform/repositories/environment-checks-repository"
);

describe("environmentChecksRepository.recent", () => {
  beforeEach(() => {
    state.data = [];
    state.error = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns [] immediately for an empty orgId, without querying", async () => {
    await expect(environmentChecksRepository.recent("")).resolves.toEqual([]);
  });

  it("maps rows to EnvironmentCheckRecord", async () => {
    state.data = [
      {
        id: "check-1",
        kind: "github",
        target: "octocat/hello-world",
        vantage: "server",
        ok: true,
        latency_ms: 120,
        checks: [],
        remediation: null,
        created_at: "2026-09-01T00:00:00.000Z",
      },
    ];

    const result = await environmentChecksRepository.recent("org-1");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "check-1", ok: true, latencyMs: 120 });
  });

  it("returns [] without logging when there are legitimately no rows", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.data = [];
    state.error = null;

    await expect(environmentChecksRepository.recent("org-1")).resolves.toEqual(
      [],
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  // Regression: a genuine fetch failure (RLS denial, network error) used to
  // return [] identically to "no checks have run yet", with no logging at
  // all -- the same silent-swallow bug already fixed in
  // github-connections-repository.ts, jira-connections-repository.ts, and
  // connections-repository.ts.
  it("logs and returns [] when the query errors", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.data = null;
    state.error = { message: "permission denied for table environment_checks" };

    await expect(environmentChecksRepository.recent("org-1")).resolves.toEqual(
      [],
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "[environment-checks-repository] recent failed",
      state.error,
    );
  });
});
