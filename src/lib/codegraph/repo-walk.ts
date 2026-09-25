/**
 * Filesystem walk used by the analyzer (`analyzer-entry.ts`) to find candidate
 * source files inside the sandbox checkout.
 *
 * Pulled into its own module (rather than staying inline in the entry point)
 * so it can be unit-tested directly: `analyzer-entry.ts` calls `main()` as a
 * side effect of being imported (it is a standalone script, not a library),
 * so nothing in that file can be exercised from a test without also running
 * the whole analyzer.
 */
import { readdirSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_IGNORE_PATTERNS } from "../../../vendor/understand-anything/core/ignore-filter";

const IGNORED_DIRS = new Set(
  DEFAULT_IGNORE_PATTERNS.filter((p) => p.endsWith("/")).map((p) =>
    p.replace(/\/$/, ""),
  ),
);

/**
 * Walks `root` for regular files, up to `limit`.
 *
 * Symlinks (to a file or a directory) are never followed. A directory
 * symlink that points back at one of its own ancestors -- a real pattern in
 * the wild (a `current -> ..` release pointer, a monorepo package linked
 * into another package's tree) -- would otherwise send this walk into an
 * ever-deepening traversal of the same subtree with no cycle detection to
 * stop it, silently burning the analyzer's whole time budget on one
 * repository quirk instead of failing fast or, worse, just running until the
 * OS's path-length limit throws (silently swallowed by the `catch` below,
 * so nothing would even explain the slowdown). `lstatSync` (which does not
 * follow the link) rather than `statSync` is what makes the symlink itself,
 * not its target, the thing being classified.
 */
export function walk(root: string, limit: number): string[] {
  const files: string[] = [];
  const stack = [root];
  while (stack.length > 0 && files.length < limit) {
    const dir = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.startsWith(".") && entry !== ".github") continue;
      if (IGNORED_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      let stats;
      try {
        stats = lstatSync(full);
      } catch {
        continue;
      }
      if (stats.isSymbolicLink()) continue;
      if (stats.isDirectory()) {
        stack.push(full);
      } else if (stats.isFile()) {
        files.push(full);
        if (files.length >= limit) break;
      }
    }
  }
  return files;
}
