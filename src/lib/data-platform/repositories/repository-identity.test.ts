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
  // `code` matters: the real bootstrap treats 23505 (unique violation) on the
  // membership inserts as "already a member", not as a failure.
  error?: { message: string; code?: string } | null;
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
 *   .from(t).select(...).eq(...).order(...).limit(...).maybeSingle()
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
  workspaceMemberInsert: FakeResult;
}) {
  const calls: string[] = [];

  function builderFor(table: string) {
    const builder = {
      select: (_cols: string) => {
        calls.push(`${table}.select`);
        const maybeSingle = async () => {
          calls.push(`${table}.maybeSingle`);
          if (table === "org_members") {
            return ok(config.orgMembership);
          }
          return ok(null);
        };
        return {
          eq: () => ({
            // `.order()` before `.limit()` is what makes a user who is
            // already in several orgs resolve to the same one every time.
            order: (column: string, opts: { ascending: boolean }) => {
              calls.push(
                `${table}.order:${column}:${opts.ascending ? "asc" : "desc"}`,
              );
              return { limit: () => ({ maybeSingle }) };
            },
          }),
        };
      },
      insert: (_payload: unknown) => {
        calls.push(`${table}.insert`);
        return {
          // Bare insert, no chained .select() -- `orgs` and `org_members`
          // both use this shape now (chaining .select() on `orgs` is
          // exactly the bug that made the real org bootstrap silently fail
          // for every user: its SELECT policy can't be satisfied until the
          // org_members self-join row exists yet).
          then: (resolve: (r: FakeResult) => void) => {
            if (table === "orgs") resolve(config.orgInsert);
            else if (table === "org_members") resolve(config.orgMemberInsert);
            else if (table === "workspace_members")
              resolve(config.workspaceMemberInsert);
            else resolve(fail("unexpected bare insert"));
          },
        };
      },
      upsert: (_payload: unknown, _opts?: unknown) => {
        calls.push(`${table}.upsert`);
        return {
          then: (resolve: (r: FakeResult) => void) => {
            if (table === "workspaces") resolve(config.workspaceUpsert);
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

import {
  ensureWorkspaceAccess,
  resetPersonalOrgBootstrap,
  resolveOrgId,
} from "./repository-identity";
import { resetSupabaseSessionBootstrap } from "#/lib/data-platform/auth-bootstrap";

const INPUT = {
  workspaceId: "ws_test",
  backendId: "backend-1",
  path: "/w/a",
};

beforeEach(() => {
  clientState.client = null;
  clientState.isSupabaseConfigured = false;
  resetSupabaseSessionBootstrap();
  resetPersonalOrgBootstrap();
});

function countCalls(calls: string[], name: string): number {
  return calls.filter((call) => call === name).length;
}

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
      workspaceMemberInsert: ok(),
    });
    clientState.client = client;
    clientState.isSupabaseConfigured = true;

    const result = await ensureWorkspaceAccess(INPUT);

    expect(result).toBe(true);
    expect(calls).toEqual([
      "auth.getSession",
      "auth.signInAnonymously",
      "org_members.select",
      "org_members.order:created_at:asc",
      "org_members.maybeSingle",
      "orgs.insert",
      "org_members.insert",
      "workspaces.upsert",
      "workspace_members.insert",
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
      workspaceMemberInsert: ok(),
    });
    clientState.client = client;
    clientState.isSupabaseConfigured = true;

    expect(await ensureWorkspaceAccess(INPUT)).toBe(true);
    expect(calls).not.toContain("orgs.insert");
    expect(calls).toContain("workspace_members.insert");
  });

  it("short-circuits when anonymous sign-in is disabled on the project", async () => {
    const { client, calls } = makeFakeClient({
      session: null,
      signInResult: "error",
      orgMembership: null,
      orgInsert: ok({ id: "org-1" }),
      orgMemberInsert: ok(),
      workspaceUpsert: ok(),
      workspaceMemberInsert: ok(),
    });
    clientState.client = client;
    clientState.isSupabaseConfigured = true;

    expect(await ensureWorkspaceAccess(INPUT)).toBe(false);
    expect(calls).not.toContain("orgs.insert");
    expect(calls).not.toContain("workspaces.upsert");
  });

  it("short-circuits when org creation fails, and logs it instead of failing silently", async () => {
    const { client } = makeFakeClient({
      session: { userId: "user-1" },
      signInResult: "ok",
      orgMembership: null,
      orgInsert: fail("42501: new row violates row-level security policy"),
      orgMemberInsert: ok(),
      workspaceUpsert: ok(),
      workspaceMemberInsert: ok(),
    });
    clientState.client = client;
    clientState.isSupabaseConfigured = true;
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    expect(await ensureWorkspaceAccess(INPUT)).toBe(false);
    // The whole point of this fix: a real, permanent failure must never be
    // silently indistinguishable from "Supabase isn't configured."
    expect(consoleError).toHaveBeenCalledWith(
      "[repository-identity] orgs insert failed",
      expect.anything(),
    );

    consoleError.mockRestore();
  });

  it("short-circuits when the workspace upsert fails", async () => {
    const { client, calls } = makeFakeClient({
      session: { userId: "user-1" },
      signInResult: "ok",
      orgMembership: { org_id: "org-existing" },
      orgInsert: ok({ id: "org-1" }),
      orgMemberInsert: ok(),
      workspaceUpsert: fail(),
      workspaceMemberInsert: ok(),
    });
    clientState.client = client;
    clientState.isSupabaseConfigured = true;

    expect(await ensureWorkspaceAccess(INPUT)).toBe(false);
    expect(calls).not.toContain("workspace_members.insert");
  });

  it("treats a unique violation on the membership insert as already-a-member", async () => {
    const { client } = makeFakeClient({
      session: { userId: "user-1" },
      signInResult: "ok",
      orgMembership: { org_id: "org-existing" },
      orgInsert: ok({ id: "org-1" }),
      orgMemberInsert: ok(),
      workspaceUpsert: ok(),
      workspaceMemberInsert: {
        data: null,
        error: { code: "23505", message: "duplicate key value" },
      },
    });
    clientState.client = client;
    clientState.isSupabaseConfigured = true;

    expect(await ensureWorkspaceAccess(INPUT)).toBe(true);
  });

  it("mints one anonymous user and one org when several consumers bootstrap at once", async () => {
    // The real cold-load shape: `use-environment-org` and
    // `use-supabase-identity` both start before either finishes. Without the
    // single-flight guards each would sign in separately (the client keeps
    // only the last session, orphaning the first uid's rows) and each would
    // insert its own client-generated org id.
    const { client, calls } = makeFakeClient({
      session: null,
      signInResult: "ok",
      orgMembership: null,
      orgInsert: ok(),
      orgMemberInsert: ok(),
      workspaceUpsert: ok(),
      workspaceMemberInsert: ok(),
    });
    clientState.client = client;
    clientState.isSupabaseConfigured = true;

    const [orgId, access] = await Promise.all([
      resolveOrgId(),
      ensureWorkspaceAccess(INPUT),
    ]);

    expect(access).toBe(true);
    expect(orgId).toBeTruthy();
    expect(countCalls(calls, "auth.signInAnonymously")).toBe(1);
    expect(countCalls(calls, "orgs.insert")).toBe(1);
  });

  it("re-queries the org on a later call instead of caching the first answer", async () => {
    const { client, calls } = makeFakeClient({
      session: { userId: "user-1" },
      signInResult: "ok",
      orgMembership: { org_id: "org-existing" },
      orgInsert: ok(),
      orgMemberInsert: ok(),
      workspaceUpsert: ok(),
      workspaceMemberInsert: ok(),
    });
    clientState.client = client;
    clientState.isSupabaseConfigured = true;

    expect(await resolveOrgId()).toBe("org-existing");
    expect(await resolveOrgId()).toBe("org-existing");
    // Single-flight, not a cache: a sign-in that changes `auth.uid()` must
    // not keep resolving the previous user's org.
    expect(countCalls(calls, "org_members.select")).toBe(2);
  });
});
