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
          order: async () => ({ data: state.data, error: state.error }),
        }),
      }),
    }),
  },
}));

const { connectionsRepository } = await import(
  "#/lib/data-platform/repositories/connections-repository"
);

describe("connectionsRepository.list", () => {
  beforeEach(() => {
    state.data = [];
    state.error = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns [] immediately for an empty orgId, without querying", async () => {
    await expect(connectionsRepository.list("")).resolves.toEqual([]);
  });

  it("maps rows to ConnectionRecord", async () => {
    state.data = [
      {
        id: "conn-1",
        org_id: "org-1",
        capability: "source_control",
        provider_id: "github",
        instance_key: "default",
        display_name: "GitHub",
        config: {},
        redacted_summary: {},
        requested_scopes: ["repo"],
        granted_scopes: ["repo"],
        status: "connected",
        last_probe: null,
        last_probe_at: null,
        expires_at: null,
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-01T00:00:00.000Z",
      },
    ];

    const result = await connectionsRepository.list("org-1");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "conn-1", providerId: "github" });
  });

  it("returns [] without logging when there are legitimately no rows", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.data = [];
    state.error = null;

    await expect(connectionsRepository.list("org-1")).resolves.toEqual([]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  // Regression: a genuine fetch failure (RLS denial, network error) used to
  // return [] identically to "no connections configured", with no logging
  // at all -- the same silent-swallow bug already fixed in
  // github-connections-repository.ts and jira-connections-repository.ts.
  it("logs and returns [] when the query errors", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.data = null;
    state.error = { message: "permission denied for table connections" };

    await expect(connectionsRepository.list("org-1")).resolves.toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      "[connections-repository] list failed",
      state.error,
    );
  });
});
