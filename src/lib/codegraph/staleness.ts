/**
 * Freshness of a stored graph against the repository's current HEAD.
 *
 * A graph is a photograph of one commit. Showing yesterday's photograph as if
 * it were today's is the worst failure this feature can have — a developer
 * would trust a dependency edge that no longer exists. So the graph's own
 * commit is always compared against HEAD before it is rendered, and a mismatch
 * is surfaced rather than smoothed over.
 *
 * Understand-Anything's `core/staleness.ts` does the equivalent check upstream,
 * but it shells out to git via `node:child_process` and so only runs in the
 * analyzer. In the browser we already know HEAD: `kt-list` resolves it through
 * `AgentServerGitService.getGitCommits` when it builds the snapshot.
 */

export type CodeGraphFreshness = "fresh" | "stale" | "unknown";

export interface FreshnessResult {
  freshness: CodeGraphFreshness;
  /** The commit the graph was built from. */
  graphCommitSha: string;
  /** The repository's current HEAD, when known. */
  headCommitSha: string | null;
  /** True when the graph must not be presented as describing current code. */
  requiresReanalysis: boolean;
}

/**
 * Compares two SHAs tolerantly: git surfaces both full and abbreviated hashes
 * depending on the call, so a short SHA that prefixes the long one is a match.
 */
export function sameCommit(a: string, b: string): boolean {
  if (!a || !b) return false;
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (left === right) return true;
  const [shorter, longer] =
    left.length <= right.length ? [left, right] : [right, left];
  // Guard against a 1-2 char "SHA" matching everything.
  return shorter.length >= 7 && longer.startsWith(shorter);
}

export function evaluateFreshness(
  graphCommitSha: string,
  headCommitSha: string | null | undefined,
): FreshnessResult {
  if (!headCommitSha) {
    // We could not resolve HEAD. Report unknown rather than claiming fresh —
    // silence here would be indistinguishable from a verified match.
    return {
      freshness: "unknown",
      graphCommitSha,
      headCommitSha: null,
      requiresReanalysis: false,
    };
  }

  const fresh = sameCommit(graphCommitSha, headCommitSha);
  return {
    freshness: fresh ? "fresh" : "stale",
    graphCommitSha,
    headCommitSha,
    requiresReanalysis: !fresh,
  };
}
