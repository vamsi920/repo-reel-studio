/**
 * Caps how many files the analyzer actually parses.
 *
 * The raw filesystem walk that finds candidate files needs its own generous
 * safety limit so a repository with many non-code files (build output,
 * lockfiles, binary assets) doesn't get silently truncated before its real
 * source files are even reached -- see `analyzer-entry.ts`'s `walk()`. The cap
 * that determines analysis *quality* belongs on the code files themselves,
 * after language filtering, not on whatever the walk happened to see first.
 * When that cap does bind, the caller must say so rather than presenting a
 * silently truncated graph as a complete one (`CodeGraphMeta.reducedAnalysis`).
 */

export interface FileSelection<T> {
  selected: T[];
  reducedAnalysis: boolean;
  skippedFileCount: number;
}

export function selectFilesToAnalyze<T>(
  codeFiles: readonly T[],
  maxFiles: number,
): FileSelection<T> {
  if (codeFiles.length <= maxFiles) {
    return {
      selected: [...codeFiles],
      reducedAnalysis: false,
      skippedFileCount: 0,
    };
  }
  return {
    selected: codeFiles.slice(0, maxFiles),
    reducedAnalysis: true,
    skippedFileCount: codeFiles.length - maxFiles,
  };
}
