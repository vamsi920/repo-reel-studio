import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * supabase/functions is excluded from this project's tsconfig (it's a
 * separate Deno program that imports its own files with explicit `.ts`
 * extensions, which `tsc` here rejects without `allowImportingTsExtensions`),
 * so the module is loaded with a dynamic, non-literal specifier -- a static
 * `import` would pull it into this project's type-checked program and break
 * `npm run typecheck`. See `__tests__/lib/environment/probe-runner.test.ts`
 * for the same pattern.
 */
const JIRA_SHARED_PATH = ["..", "..", "..", "supabase", "functions", "_shared", "jira.ts"].join("/");
const { verifyAtlassianWebhookJwt, refreshJiraAccessToken, refreshJiraAccessTokenLocked } =
  await import(/* @vite-ignore */ JIRA_SHARED_PATH);

const CLIENT_SECRET = "test-client-secret";

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlEncodeString(value: string): string {
  return base64UrlEncode(new TextEncoder().encode(value));
}

async function signHs256(clientSecret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(clientSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return base64UrlEncode(new Uint8Array(signature));
}

async function makeJwt(
  payload: Record<string, unknown>,
  clientSecret = CLIENT_SECRET,
): Promise<string> {
  const headerB64 = base64UrlEncodeString(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payloadB64 = base64UrlEncodeString(JSON.stringify(payload));
  const signatureB64 = await signHs256(clientSecret, `${headerB64}.${payloadB64}`);
  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

describe("verifyAtlassianWebhookJwt", () => {
  it("returns the payload for a validly signed, unexpired token", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const token = await makeJwt({ sub: "user-1", exp: nowSeconds + 3600 });

    const result = await verifyAtlassianWebhookJwt(token, CLIENT_SECRET);

    expect(result).toEqual({ sub: "user-1", exp: nowSeconds + 3600 });
  });

  it("rejects a token whose exp claim is in the past", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const token = await makeJwt({ sub: "user-1", exp: nowSeconds - 3600 });

    const result = await verifyAtlassianWebhookJwt(token, CLIENT_SECRET);

    expect(result).toBeNull();
  });

  it("rejects a token with no exp claim at all", async () => {
    const token = await makeJwt({ sub: "user-1" });

    const result = await verifyAtlassianWebhookJwt(token, CLIENT_SECRET);

    expect(result).toBeNull();
  });

  it("rejects a token whose signature does not match the client secret", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const token = await makeJwt(
      { sub: "user-1", exp: nowSeconds + 3600 },
      "a-different-secret",
    );

    const result = await verifyAtlassianWebhookJwt(token, CLIENT_SECRET);

    expect(result).toBeNull();
  });

  it("accepts a token expiring within the clock-skew leeway window", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const token = await makeJwt({ sub: "user-1", exp: nowSeconds - 10 });

    const result = await verifyAtlassianWebhookJwt(token, CLIENT_SECRET);

    expect(result).toEqual({ sub: "user-1", exp: nowSeconds - 10 });
  });

  it("rejects a malformed token", async () => {
    const result = await verifyAtlassianWebhookJwt("not-a-jwt", CLIENT_SECRET);

    expect(result).toBeNull();
  });
});

function makeFakeAdmin() {
  const updateCalls: { table: string; row: unknown; userId: string }[] = [];
  const admin = {
    from(table: string) {
      return {
        update(row: unknown) {
          return {
            eq: async (_column: string, userId: string) => {
              updateCalls.push({ table, row, userId });
              return { error: null };
            },
          };
        },
      };
    },
    rpc: async (fn: string, args: { token: string }) => {
      // The refresh is serialised through an advisory lock; this fake always
      // grants it (and accepts the unlock).
      if (fn === "environment_try_advisory_lock") return { data: true, error: null };
      if (fn === "environment_advisory_unlock") return { data: null, error: null };
      return { data: `encrypted(${args.token})`, error: null };
    },
  };
  return { admin, updateCalls };
}

describe("refreshJiraAccessToken", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists and returns the new access and refresh tokens on success", async () => {
    vi.stubGlobal("Deno", {
      env: { get: () => "test-oauth-value" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
        }),
      }),
    );
    const { admin, updateCalls } = makeFakeAdmin();

    const result = await refreshJiraAccessToken(
      admin,
      "user-1",
      "old-refresh-token",
      "old-access-token",
      "encryption-key",
    );

    expect(result).toBe("new-access-token");
    expect(updateCalls).toEqual([
      {
        table: "jira_connections",
        row: expect.objectContaining({
          encrypted_access_token: "encrypted(new-access-token)",
          encrypted_refresh_token: "encrypted(new-refresh-token)",
        }),
        userId: "user-1",
      },
    ]);
  });

  it("falls back to the existing access token without persisting when the token endpoint rejects the refresh", async () => {
    vi.stubGlobal("Deno", { env: { get: () => "test-oauth-value" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const { admin, updateCalls } = makeFakeAdmin();

    const result = await refreshJiraAccessToken(
      admin,
      "user-1",
      "old-refresh-token",
      "old-access-token",
      "encryption-key",
    );

    expect(result).toBe("old-access-token");
    expect(updateCalls).toHaveLength(0);
  });

  it("falls back to the existing access token when Jira OAuth is not configured for this deployment", async () => {
    vi.stubGlobal("Deno", { env: { get: () => undefined } });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { admin, updateCalls } = makeFakeAdmin();

    const result = await refreshJiraAccessToken(
      admin,
      "user-1",
      "old-refresh-token",
      "old-access-token",
      "encryption-key",
    );

    expect(result).toBe("old-access-token");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });
});

function makeFakeLockableAdmin(options: {
  /** Applied to every `environment_try_advisory_lock` call unless
   * `gotLockSequence` is given. */
  gotLock: boolean | null | undefined;
  /** One value per successive `environment_try_advisory_lock` call (the
   * initial attempt plus each retry while polling for the lock to free);
   * the last entry repeats once exhausted. Overrides `gotLock` when set. */
  gotLockSequence?: (boolean | null | undefined)[];
  lockError?: unknown;
  currentEncryptedAccessToken?: string;
}) {
  const rpcCalls: { fn: string; args: unknown }[] = [];
  const updateCalls: { table: string; row: unknown; userId: string }[] = [];
  let lockAttempt = 0;
  const admin = {
    from(table: string) {
      return {
        select: () => ({
          eq: (_column: string, userId: string) => ({
            maybeSingle: async () => ({
              data: options.currentEncryptedAccessToken
                ? { encrypted_access_token: options.currentEncryptedAccessToken }
                : null,
              error: null,
            }),
          }),
        }),
        update(row: unknown) {
          return {
            eq: async (_column: string, userId: string) => {
              updateCalls.push({ table, row, userId });
              return { error: null };
            },
          };
        },
      };
    },
    rpc: async (fn: string, args: Record<string, string>) => {
      rpcCalls.push({ fn, args });
      if (fn === "environment_try_advisory_lock") {
        if (options.gotLockSequence) {
          const value =
            options.gotLockSequence[
              Math.min(lockAttempt, options.gotLockSequence.length - 1)
            ];
          lockAttempt += 1;
          return { data: value, error: options.lockError ?? null };
        }
        return { data: options.gotLock, error: options.lockError ?? null };
      }
      if (fn === "environment_advisory_unlock") return { data: true, error: null };
      if (fn === "encrypt_github_token") {
        return { data: `encrypted(${args.token})`, error: null };
      }
      if (fn === "decrypt_github_token") {
        const match = /^encrypted\((.*)\)$/.exec(args.ciphertext);
        return { data: match ? match[1] : args.ciphertext, error: null };
      }
      return { data: null, error: null };
    },
  };
  return { admin, rpcCalls, updateCalls };
}

describe("refreshJiraAccessTokenLocked", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("acquires the lock, refreshes, persists, and releases the lock on success", async () => {
    vi.stubGlobal("Deno", { env: { get: () => "test-oauth-value" } });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
        }),
      }),
    );
    const { admin, rpcCalls, updateCalls } = makeFakeLockableAdmin({ gotLock: true });

    const result = await refreshJiraAccessTokenLocked(
      admin,
      "user-1",
      "old-refresh-token",
      "encryption-key",
    );

    expect(result).toBe("new-access-token");
    expect(updateCalls).toEqual([
      {
        table: "jira_connections",
        row: expect.objectContaining({
          encrypted_access_token: "encrypted(new-access-token)",
          encrypted_refresh_token: "encrypted(new-refresh-token)",
        }),
        userId: "user-1",
      },
    ]);
    expect(rpcCalls.map((call) => call.fn)).toEqual([
      "environment_try_advisory_lock",
      "encrypt_github_token",
      "encrypt_github_token",
      "environment_advisory_unlock",
    ]);
  });

  it("waits for the winner's lock to free rather than immediately re-reading the same token that just 401'd, then reuses the winner's freshly-committed token", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Deno", { env: { get: () => "test-oauth-value" } });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    // The initial attempt loses the race, and so do the first two polls --
    // the winner's fetch()+DB write is still in flight -- before the lock
    // frees on the third poll.
    const { admin, rpcCalls, updateCalls } = makeFakeLockableAdmin({
      gotLock: false,
      gotLockSequence: [false, false, false, true],
      currentEncryptedAccessToken: "encrypted(winners-access-token)",
    });

    const resultPromise = refreshJiraAccessTokenLocked(
      admin,
      "user-1",
      "old-refresh-token",
      "encryption-key",
    );
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe("winners-access-token");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
    // Initial attempt + 3 polls before the lock is seen free, then a single
    // unlock of the lock this call itself briefly re-acquired to detect that.
    expect(
      rpcCalls.filter((call) => call.fn === "environment_try_advisory_lock"),
    ).toHaveLength(4);
    expect(
      rpcCalls.filter((call) => call.fn === "environment_advisory_unlock"),
    ).toHaveLength(1);
  });

  it("falls back to whatever is currently stored if the winner's lock never frees within the bounded poll budget", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Deno", { env: { get: () => "test-oauth-value" } });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { admin, rpcCalls, updateCalls } = makeFakeLockableAdmin({
      gotLock: false,
      currentEncryptedAccessToken: "encrypted(still-stale-access-token)",
    });

    const resultPromise = refreshJiraAccessTokenLocked(
      admin,
      "user-1",
      "old-refresh-token",
      "encryption-key",
    );
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe("still-stale-access-token");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
    // Initial attempt + every bounded retry, all still reporting the lock
    // held, and never an unlock call of a lock this call never acquired.
    expect(
      rpcCalls.filter((call) => call.fn === "environment_try_advisory_lock"),
    ).toHaveLength(11);
    expect(
      rpcCalls.filter((call) => call.fn === "environment_advisory_unlock"),
    ).toHaveLength(0);
  });

  it("returns null rather than racing a second grant when the lock RPC itself fails", async () => {
    vi.stubGlobal("Deno", { env: { get: () => "test-oauth-value" } });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { admin } = makeFakeLockableAdmin({
      gotLock: undefined,
      lockError: { message: "connection reset" },
      currentEncryptedAccessToken: undefined,
    });

    const result = await refreshJiraAccessTokenLocked(
      admin,
      "user-1",
      "old-refresh-token",
      "encryption-key",
    );

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null without attempting to acquire the lock when Jira OAuth is not configured", async () => {
    vi.stubGlobal("Deno", { env: { get: () => undefined } });
    const { admin, rpcCalls } = makeFakeLockableAdmin({ gotLock: true });

    const result = await refreshJiraAccessTokenLocked(
      admin,
      "user-1",
      "old-refresh-token",
      "encryption-key",
    );

    expect(result).toBeNull();
    expect(rpcCalls).toHaveLength(0);
  });
});
