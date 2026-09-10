import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  data: null as Record<string, unknown> | null,
  error: null as { message: string } | null,
}));

vi.mock("#/lib/data-platform/client", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: state.data, error: state.error }),
        }),
      }),
    }),
  },
}));

const { githubConnectionsRepository } = await import(
  "#/lib/data-platform/repositories/github-connections-repository"
);

describe("githubConnectionsRepository.getConnection", () => {
  beforeEach(() => {
    state.user = { id: "user-1" };
    state.data = null;
    state.error = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the mapped connection when a row exists", async () => {
    state.data = {
      github_username: "octocat",
      enterprise_host: null,
      connected_at: "2026-09-01T00:00:00.000Z",
    };

    await expect(githubConnectionsRepository.getConnection()).resolves.toEqual({
      githubUsername: "octocat",
      enterpriseHost: null,
      connectedAt: "2026-09-01T00:00:00.000Z",
    });
  });

  it("returns null without logging when there is legitimately no row", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.data = null;
    state.error = null;

    await expect(
      githubConnectionsRepository.getConnection(),
    ).resolves.toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  // Regression: a genuine fetch failure (RLS denial, network error) used to
  // return null identically to "no connection exists", with no logging at
  // all -- indistinguishable from a real "not connected" state anywhere in
  // the console, which made a broken GitHub connection invisible.
  it("logs and returns null when the query errors", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.data = null;
    state.error = { message: "permission denied for table github_connections" };

    await expect(
      githubConnectionsRepository.getConnection(),
    ).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      "[github-connections-repository] getConnection failed",
      state.error,
    );
  });

  it("logs and returns null without querying when there is no authenticated user", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.user = null;

    await expect(
      githubConnectionsRepository.getConnection(),
    ).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      "[github-connections-repository] getConnection: getUser() returned no user despite an active session",
    );
  });
});
