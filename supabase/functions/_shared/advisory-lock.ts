/**
 * Decides whether an `environment_try_advisory_lock` RPC result means the
 * caller actually holds the lock.
 *
 * The RPC (`supabase/migrations/20260830100500_environment_advisory_locks.sql`)
 * always returns a real `boolean` on success -- `data` only comes back
 * `undefined`/`null` when the RPC call itself failed (a transient DB error,
 * not the lock being held by someone else, which is a clean `false`).
 * Treating anything other than a clean `false` as "we hold the lock" -- the
 * bug this guards against -- means a transient RPC error silently bypasses
 * the serialisation the lock exists for, letting two concurrent token
 * refreshes race and the loser write back a refresh token the provider has
 * already rotated away.
 */
export function holdsAdvisoryLock(
  gotLock: boolean | null | undefined,
  error: unknown,
): boolean {
  return !error && gotLock === true;
}
