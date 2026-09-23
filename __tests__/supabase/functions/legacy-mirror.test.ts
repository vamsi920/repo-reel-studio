import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Regression coverage for the github_connections mirror collision: that
 * table's primary key is `user_id` alone (see
 * `supabase/migrations/20260824130000_github_connections.sql`) -- it has no
 * column distinguishing a "github" connection from a "github-enterprise"
 * one, even though the generic `connections` table this mirrors from lets a
 * user hold both at once. Before this fix, connecting the second variant
 * silently overwrote the first's token/host with no error anywhere, and
 * disconnecting either variant unconditionally deleted whatever row
 * currently existed -- including one that actually belonged to the other,
 * still-connected variant.
 *
 * supabase/functions is excluded from this project's tsconfig (see
 * __tests__/lib/environment/probe-runner.test.ts for why), so the module is
 * loaded with a dynamic, non-literal specifier.
 */
const LEGACY_MIRROR_PATH = [
  "..",
  "..",
  "..",
  "supabase",
  "functions",
  "_shared",
  "legacy-mirror.ts",
].join("/");
const { mirrorToLegacy, unmirrorFromLegacy } = await import(
  /* @vite-ignore */ LEGACY_MIRROR_PATH
);

interface FakeGithubRow {
  enterprise_host: string | null;
}

function makeFakeAdmin(existingRow: FakeGithubRow | null) {
  const upsertCalls: unknown[] = [];
  const deleteCalls: { table: string; userId: string }[] = [];

  const admin = {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data: existingRow, error: null }),
              };
            },
          };
        },
        upsert(row: unknown) {
          upsertCalls.push(row);
          return Promise.resolve({ error: null });
        },
        delete() {
          return {
            eq: async (_column: string, userId: string) => {
              deleteCalls.push({ table, userId });
              return { error: null };
            },
          };
        },
      };
    },
    rpc: async () => ({ data: "encrypted-cipher", error: null }),
  };

  return { admin, upsertCalls, deleteCalls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mirrorToLegacy github variant conflict", () => {
  it("skips without overwriting when an existing github.com mirror is present and github-enterprise connects", async () => {
    const { admin, upsertCalls } = makeFakeAdmin({ enterprise_host: null });

    const outcome = await mirrorToLegacy(admin, {
      providerId: "github-enterprise",
      userId: "user-1",
      config: { enterpriseHost: "ghe.example.com" },
      credentials: { accessToken: "ghp_new" },
      scopes: ["repo"],
      identity: { id: 42, name: "octocat" },
    });

    expect(outcome).toEqual({
      mirrored: null,
      reason: "conflicts_with_other_github_variant",
    });
    expect(upsertCalls).toHaveLength(0);
  });

  it("skips without overwriting when an existing github-enterprise mirror is present and github.com connects", async () => {
    const { admin, upsertCalls } = makeFakeAdmin({
      enterprise_host: "ghe.example.com",
    });

    const outcome = await mirrorToLegacy(admin, {
      providerId: "github",
      userId: "user-1",
      config: {},
      credentials: { accessToken: "ghp_new" },
      scopes: ["repo"],
      identity: { id: 42, name: "octocat" },
    });

    expect(outcome).toEqual({
      mirrored: null,
      reason: "conflicts_with_other_github_variant",
    });
    expect(upsertCalls).toHaveLength(0);
  });

  it("still mirrors when the existing row is the same variant (a token refresh)", async () => {
    vi.stubGlobal("Deno", { env: { get: () => "test-key" } });
    const { admin, upsertCalls } = makeFakeAdmin({ enterprise_host: null });

    const outcome = await mirrorToLegacy(admin, {
      providerId: "github",
      userId: "user-1",
      config: {},
      credentials: { accessToken: "ghp_refreshed" },
      scopes: ["repo"],
      identity: { id: 42, name: "octocat" },
    });

    expect(outcome).toEqual({ mirrored: "github" });
    expect(upsertCalls).toHaveLength(1);
  });

  it("still mirrors when no row exists yet (first connection)", async () => {
    vi.stubGlobal("Deno", { env: { get: () => "test-key" } });
    const { admin, upsertCalls } = makeFakeAdmin(null);

    const outcome = await mirrorToLegacy(admin, {
      providerId: "github-enterprise",
      userId: "user-1",
      config: { enterpriseHost: "ghe.example.com" },
      credentials: { accessToken: "ghp_new" },
      scopes: ["repo"],
      identity: { id: 42, name: "octocat" },
    });

    expect(outcome).toEqual({ mirrored: "github" });
    expect(upsertCalls).toHaveLength(1);
  });
});

describe("unmirrorFromLegacy github variant safety", () => {
  it("does not delete a github-enterprise mirror when github.com is disconnected", async () => {
    const { admin, deleteCalls } = makeFakeAdmin({
      enterprise_host: "ghe.example.com",
    });

    await unmirrorFromLegacy(admin, "github", "user-1");

    expect(deleteCalls).toHaveLength(0);
  });

  it("does not delete a github.com mirror when github-enterprise is disconnected", async () => {
    const { admin, deleteCalls } = makeFakeAdmin({ enterprise_host: null });

    await unmirrorFromLegacy(admin, "github-enterprise", "user-1");

    expect(deleteCalls).toHaveLength(0);
  });

  it("deletes the mirror when the variant matches", async () => {
    const { admin, deleteCalls } = makeFakeAdmin({ enterprise_host: null });

    await unmirrorFromLegacy(admin, "github", "user-1");

    expect(deleteCalls).toEqual([{ table: "github_connections", userId: "user-1" }]);
  });

  it("no-ops when no mirror row exists", async () => {
    const { admin, deleteCalls } = makeFakeAdmin(null);

    await unmirrorFromLegacy(admin, "github", "user-1");

    expect(deleteCalls).toHaveLength(0);
  });
});
