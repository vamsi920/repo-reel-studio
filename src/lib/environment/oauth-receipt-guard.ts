/**
 * Marks an OAuth redirect receipt (a `?connected=`/`?error=` query string) as
 * consumed for the current page load, so React 18 StrictMode's double-invoked
 * effect doesn't toast twice or post two results to a waiting agent.
 *
 * Deliberately module-scoped instead of `sessionStorage`: a real OAuth round
 * trip is always a fresh page load (the browser leaves for the provider and
 * comes back), which naturally clears this. `sessionStorage` does not -- it
 * persists for the whole tab, so a *second* real connect (or repeated error)
 * for the same provider in the same tab silently hit a stale guard from the
 * first one and its toast/result post never fired.
 */
const consumedReceipts = new Set<string>();

export function consumeOAuthReceiptOnce(key: string): boolean {
  if (consumedReceipts.has(key)) return false;
  consumedReceipts.add(key);
  return true;
}

/** Test-only: simulates a fresh page load between test cases. */
export function resetOAuthReceiptGuardForTests(): void {
  consumedReceipts.clear();
}
