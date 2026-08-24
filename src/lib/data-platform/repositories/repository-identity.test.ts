/**
 * `ensureWorkspaceAccess` is the bootstrap every RLS-gated Supabase write in
 * this app depends on -- get the order wrong and every dependent write keeps
 * silently failing exactly as it does today with no session at all. These
 * tests exercise the real chain (session -> org -> membership) against a
 * fake client, not just the "unconfigured" early return.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeResult {
  data?: unknown;
  error?: { message: string } | null;
}

function ok(data: unknown = null): FakeResult {
  return { data, error: null };
}

function fail(message = "denied"): FakeResult {
  return { data: null, error: { message } };
}

/**
 * Minimal fake query builder covering exactly the call shapes
 * `repository-identity.ts` and `workspace-repository.ts` make:
 *   .from(t).select(...).eq(...).limit(...).maybeSingle()
 *   .from(t).insert(...).select(...).single()
 *   .from(t).insert(...)
 *   .from(t).upsert(...)
 */
function makeFakeClient(config: {
  session: { userId: string } | null;
  signInResult: "ok" | "error";
  orgMembership: { org_id: string } | null;
  orgInsert: FakeResult;
  orgMemberInsert: FakeResult;
  workspaceUpsert: FakeResult;
  workspaceMemberUpsert: FakeResult;
}) {
  const calls: string[] = [];

  function builderFor(table: string) {
    const builder = {
      select: (_cols: string) => {
        calls.push(`${table}.select`);
        return {
          eq: () => ({
            limit: () => ({
              maybeSingle: async () => {
                calls.push(`${table}.maybeSingle`);
                if (table === "org_members") {
                  return ok(config.orgMembership);
                }
                return ok(null);
              },
            }),
          }),
        };
      },
      insert: (_payload: unknown) => {
        calls.push(`${table}.insert`);
        return {
          select: (_cols: string) => ({
            single: async () => {
              calls.push(`${table}.single`);
              if (table === "orgs") return config.orgInsert;
              return fail("unexpected insert.select().single()");
            },
          }),
          // Bare insert with no chained select (org_members path).
          then: (resolve: (r: FakeResult) => void) => {
            if (table === "org_members") resolve(config.orgMemberInsert);
            else resolve(fail("unexpected bare insert"));
          },
        };
      },
      upsert: (_payload: unknown, _opts?: unknown) => {
        calls.push(`${table}.upsert`);
        return {
          then: (resolve: (r: FakeResult) => void) => {
            if (table === "workspaces") resolve(config.workspaceUpsert);
            else if (table === "workspace_members")
              resolve(config.workspaceMemberUpsert);
            else resolve(fail("unexpected upsert"));
          },
        };
      },
    };
    return builder;
  }

  const client = {
    auth: {
      getSession: async () => {
        calls.push("auth.getSession");
        return {
          data: {
            session: config.session
              ? { user: { id: config.session.userId } }
              : null,
          },
        };
      },
      signInAnonymously: async () => {
        calls.push("auth.signInAnonymously");
        if (config.signInResult === "error") {
          return { data: { session: null }, error: { message: "disabled" } };
        }
        return {
          data: { session: { user: { id: "anon-user-1" } } },
          error: null,
        };
      },
    },
    from: (table: string) => builderFor(table),
  };

  return { client, calls };
}

const clientState: { client: unknown; isSupabaseConfigured: boolean } = {
  client: null,
  isSupabaseConfigured: false,
};

vi.mock("#/lib/data-platform/client", () => ({
  get supabase() {
    return clientState.client;
  },
  get isSupabaseConfigured() {
    return clientState.isSupabaseConfigured;
  },
}));

import { ensureWorkspaceAccess } from "./repository-identity";

const INPUT = {
  workspaceId: "ws_test",
  backendId: "backend-1",
  path: "/w/a",
};

beforeEach(() => {
  clientState.client = null;
  clientState.isSupabaseConfigured = false;
});

describe("ensureWorkspaceAccess", () => {
  it("returns false without attempting anything when Supabase is unconfigured", async () => {
    expect(await ensureWorkspaceAccess(INPUT)).toBe(false);
  });

  it("bootstraps session -> org -> membership in order on a brand-new user", async () => {
    const { client, calls } = makeFakeClient({
      session: null,
      signInResult: "ok",
      orgMembership: null,
      orgInsert: ok({ id: "org-1" }),
      orgMemberInsert: ok(),
      workspaceUpsert: ok(),
      workspaceMemberUpsert: ok(),
    });
    clientState.client = client;
    clientState.isSupabaseConfigured = true;

    const result = await ensureWorkspaceAccess(INPUT);

    expect(result).toBe(true);
    expect(calls).toEqual([
      "auth.getSession",
      "auth.signInAnonymously",
      "org_members.select",
      "org_members.maybeSingle",
      "orgs.insert",
      "orgs.single",
      "org_members.insert",
      "workspaces.upsert",
      "workspace_members.upsert",
    ]);
  });

  it("reuses an existing org without creating a new one", async () => {
    const { client, calls } = makeFakeClient({
      session: { userId: "user-1" },
      signInResult: "ok",
      orgMembership: { org_id: "org-existing" },
      orgInsert: ok({ id: "org-1" }),
      orgMemberInsert: ok(),
      workspaceUpsert: ok(),
      workspaceMemberUpsert: ok(),
    });
    clientState.client = client;
    clientState.isSupabaseConfigured = true;

    expect(await ensureWorkspaceAccess(INPUT)).toBe(true);
    expect(calls).not.toContain("orgs.insert");
    expect(calls).toContain("workspace_members.upsert");
  });

  it("short-circuits when anonymous sign-in is disabled on the project", async () => {
    const { client, calls } = makeFakeClient({
      session: null,
      signInResult: "error",
      orgMembership: null,
      orgInsert: ok({ id: "org-1" }),
      orgMemberInsert: ok(),
      workspaceUpsert: ok(),
      workspaceMemberUpsert: ok(),
    });
    clientState.client = client;
    clientState.isSupabaseConfigured = true;

    expect(await ensureWorkspaceAccess(INPUT)).toBe(false);
    expect(calls).not.toContain("orgs.insert");
    expect(calls).not.toContain("workspaces.upsert");
  });

  it("short-circuits when org creation fails", async () => {
    const { client } = makeFakeClient({
      session: { userId: "user-1" },
      signInResult: "ok",
      orgMembership: null,
      orgInsert: fail(),
      orgMemberInsert: ok(),
      workspaceUpsert: ok(),
      workspaceMemberUpsert: ok(),
    });
    clientState.client = client;
    clientState.isSupabaseConfigured = true;

    expect(await ensureWorkspaceAccess(INPUT)).toBe(false);
  });

  it("short-circuits when the workspace upsert fails", async () => {
    const { client, calls } = makeFakeClient({
      session: { userId: "user-1" },
      signInResult: "ok",
      orgMembership: { org_id: "org-existing" },
      orgInsert: ok({ id: "org-1" }),
      orgMemberInsert: ok(),
      workspaceUpsert: fail(),
      workspaceMemberUpsert: ok(),
    });
    clientState.client = client;
    clientState.isSupabaseConfigured = true;

    expect(await ensureWorkspaceAccess(INPUT)).toBe(false);
    expect(calls).not.toContain("workspace_members.upsert");
  });
});
