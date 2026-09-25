import { describe, expect, it } from "vitest";

/**
 * Regression coverage for the fail-open advisory-lock bug: `connections-proxy`'s
 * token-refresh critical section used to check only `gotLock === false`, so
 * an RPC error (network blip, pool exhaustion) left `gotLock` `undefined` --
 * `!== false`, so the check silently fell through as if the lock had been
 * acquired, letting two concurrent refreshes race and the loser write back a
 * refresh token the provider had already rotated away.
 *
 * supabase/functions is excluded from this project's tsconfig, so the module
 * is loaded with a dynamic, non-literal specifier -- see
 * __tests__/lib/environment/probe-runner.test.ts for why.
 */
const ADVISORY_LOCK_PATH = [
  "..",
  "..",
  "..",
  "supabase",
  "functions",
  "_shared",
  "advisory-lock.ts",
].join("/");
const { holdsAdvisoryLock } = await import(/* @vite-ignore */ ADVISORY_LOCK_PATH);

describe("holdsAdvisoryLock", () => {
  it("holds the lock when the RPC cleanly returned true", () => {
    expect(holdsAdvisoryLock(true, null)).toBe(true);
  });

  it("does not hold the lock when another caller already holds it", () => {
    expect(holdsAdvisoryLock(false, null)).toBe(false);
  });

  it("does not hold the lock when the RPC call itself failed", () => {
    expect(
      holdsAdvisoryLock(undefined, { message: "connection reset" }),
    ).toBe(false);
  });

  it("does not hold the lock for an unexpected falsy result with no reported error", () => {
    expect(holdsAdvisoryLock(null, null)).toBe(false);
  });
});
