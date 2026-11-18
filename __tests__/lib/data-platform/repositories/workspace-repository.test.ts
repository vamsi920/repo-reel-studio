import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  isSupabaseConfigured: true,
  upserted: [] as Record<string, unknown>[],
  upsertError: null as { message: string; code?: string } | null,
  renamed: [] as Record<string, unknown>[],
  selectData: null as Record<string, unknown>[] | null,
  selectError: null as { message: string } | null,
}));

vi.mock("#/lib/data-platform/client", () => ({
  get isSupabaseConfigured() {
    return state.isSupabaseConfigured;
  },
  supabase: {
    from: () => ({
      // A plain insert: an upsert's conflict branch is an UPDATE, which a
      // teammate who did not register the workspace may not run.
      insert: (row: Record<string, unknown>) => {
        state.upserted.push(row);
        return Promise.resolve({ error: state.upsertError });
      },
      update: (row: Record<string, unknown>) => ({
        eq: () => ({
          is: async () => {
            state.renamed.push(row);
            return { error: null };
          },
        }),
      }),
      select: () => ({
        eq: async () => ({ data: state.selectData, error: state.selectError }),
      }),
    }),
  },
}));

const { workspaceRepository } = await import(
  "#/lib/data-platform/repositories/workspace-repository"
);

describe("workspaceRepository.ensureWorkspace", () => {
  beforeEach(() => {
    state.isSupabaseConfigured = true;
    state.upserted = [];
    state.upsertError = null;
    state.renamed = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns ok without upserting when Supabase isn't configured", async () => {
    state.isSupabaseConfigured = false;
    await expect(
      workspaceRepository.ensureWorkspace({
        id: "ws-1",
        orgId: "org-1",
        backendId: "backend-1",
        path: "/tmp/project",
      }),
    ).resolves.toEqual({ ok: true });
    expect(state.upserted).toHaveLength(0);
  });

  it("omits name from the upsert when none is given, so a conflict never clobbers an existing name", async () => {
    await expect(
      workspaceRepository.ensureWorkspace({
        id: "ws-1",
        orgId: "org-1",
        backendId: "backend-1",
        path: "/tmp/project",
      }),
    ).resolves.toEqual({ ok: true });
    expect(state.upserted).toEqual([
      {
        id: "ws-1",
        org_id: "org-1",
        backend_id: "backend-1",
        path: "/tmp/project",
      },
    ]);
  });

  it("passes the name through when provided", async () => {
    await workspaceRepository.ensureWorkspace({
      id: "ws-1",
      orgId: "org-1",
      backendId: "backend-1",
      path: "/tmp/project",
      name: "My Project",
    });
    expect(state.upserted[0]).toMatchObject({ name: "My Project" });
  });

  it("treats a workspace someone already registered as success, and only fills in a missing name", async () => {
    state.upsertError = { code: "23505", message: "duplicate key value" };

    await expect(
      workspaceRepository.ensureWorkspace({
        id: "ws-1",
        orgId: "org-other-team",
        backendId: "backend-1",
        path: "/tmp/project",
        name: "My Project",
      }),
    ).resolves.toEqual({ ok: true });
    // The follow-up never carries a team: a workspace stays where it was made.
    expect(state.renamed).toEqual([{ name: "My Project" }]);
  });

  it("returns ok:false with the error message when the upsert fails", async () => {
    state.upsertError = { message: "permission denied for table workspaces" };
    await expect(
      workspaceRepository.ensureWorkspace({
        id: "ws-1",
        orgId: "org-1",
        backendId: "backend-1",
        path: "/tmp/project",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "permission denied for table workspaces",
    });
  });
});

describe("workspaceRepository.listWorkspacesForOrg", () => {
  beforeEach(() => {
    state.isSupabaseConfigured = true;
    state.selectData = [];
    state.selectError = null;
  });

  it("returns [] for an empty orgId without querying", async () => {
    await expect(workspaceRepository.listWorkspacesForOrg("")).resolves.toEqual(
      [],
    );
  });

  it("maps rows to WorkspaceRow", async () => {
    state.selectData = [
      {
        id: "ws-1",
        org_id: "org-1",
        backend_id: "backend-1",
        path: "/tmp/project",
        name: "My Project",
      },
    ];
    await expect(
      workspaceRepository.listWorkspacesForOrg("org-1"),
    ).resolves.toEqual([
      {
        id: "ws-1",
        orgId: "org-1",
        backendId: "backend-1",
        path: "/tmp/project",
        name: "My Project",
      },
    ]);
  });

  it("returns [] when the query errors", async () => {
    state.selectData = null;
    state.selectError = { message: "permission denied" };
    await expect(
      workspaceRepository.listWorkspacesForOrg("org-1"),
    ).resolves.toEqual([]);
  });
});
