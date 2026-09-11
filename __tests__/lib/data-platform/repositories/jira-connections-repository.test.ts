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

const { jiraConnectionsRepository } = await import(
  "#/lib/data-platform/repositories/jira-connections-repository"
);

describe("jiraConnectionsRepository.getConnection", () => {
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
      site_name: "Acme",
      site_url: "https://acme.atlassian.net",
      atlassian_email: "dev@acme.com",
      connected_at: "2026-09-01T00:00:00.000Z",
      cloud_id: "cloud-1",
    };

    await expect(jiraConnectionsRepository.getConnection()).resolves.toEqual({
      siteName: "Acme",
      siteUrl: "https://acme.atlassian.net",
      atlassianEmail: "dev@acme.com",
      connectedAt: "2026-09-01T00:00:00.000Z",
      cloudId: "cloud-1",
    });
  });

  it("returns null without logging when there is legitimately no row", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.data = null;
    state.error = null;

    await expect(
      jiraConnectionsRepository.getConnection(),
    ).resolves.toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  // Regression: a genuine fetch failure (RLS denial, network error) used to
  // return null identically to "no connection exists", with no logging at
  // all -- the same silent-swallow bug already fixed in
  // github-connections-repository.ts.
  it("logs and returns null when the query errors", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.data = null;
    state.error = { message: "permission denied for table jira_connections" };

    await expect(
      jiraConnectionsRepository.getConnection(),
    ).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      "[jira-connections-repository] getConnection failed",
      state.error,
    );
  });

  it("logs and returns null without querying when there is no authenticated user", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.user = null;

    await expect(
      jiraConnectionsRepository.getConnection(),
    ).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      "[jira-connections-repository] getConnection: getUser() returned no user despite an active session",
    );
  });
});
