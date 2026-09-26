/**
 * Resolves a relative import specifier to the analyzed file it points at.
 *
 * Pulled out of `analyzer-entry.ts` (which only runs inside the sandbox, so
 * nothing in that file can be exercised from a test without running the whole
 * analyzer) the same way `repo-walk.ts`'s `walk()` was.
 */
import { resolve as resolvePath } from "node:path";

/** Extensions a resolved path may carry, checked in this order. */
const CANDIDATE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".go",
  ".rs",
  ".java",
];

/**
 * Extensions a relative import specifier can carry while pointing at a
 * source file with a *different* real extension. TypeScript's NodeNext/
 * Node16 module resolution requires this for ESM: `import "./foo.js"` is
 * valid there and expected to resolve to `foo.ts`, since Node itself only
 * ever sees the compiled `.js` output, not the TypeScript source.
 *
 * Without stripping the specifier's own extension first, none of
 * `CANDIDATE_EXTENSIONS` above can ever match it: they only append an
 * extension, so `foo.js` + `.ts` produces the nonsensical `foo.js.ts`, never
 * the real `foo.ts`. Left unhandled, every relative import in a repository
 * written this way -- an increasingly common modern TypeScript/ESM pattern --
 * would silently produce no edge at all.
 */
const EXTENSIONS_A_SPECIFIER_MAY_ALREADY_CARRY = [
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
];

function withoutCompiledExtension(path: string): string | null {
  for (const ext of EXTENSIONS_A_SPECIFIER_MAY_ALREADY_CARRY) {
    if (path.endsWith(ext)) return path.slice(0, -ext.length);
  }
  return null;
}

/**
 * `hasFile` reports whether a repository-relative path was actually
 * analyzed -- callers pass `byPath.has`, so this stays a pure function
 * testable without a real filesystem or analyzer run.
 */
export function resolveImportPath(
  fromPath: string,
  source: string,
  hasFile: (path: string) => boolean,
): string | null {
  if (!source.startsWith(".")) return null;
  const fromDir = fromPath.includes("/")
    ? fromPath.slice(0, fromPath.lastIndexOf("/"))
    : "";
  const joined = resolvePath("/", fromDir, source).slice(1);

  const candidates = [
    joined,
    ...CANDIDATE_EXTENSIONS.flatMap((ext) => [
      `${joined}${ext}`,
      `${joined}/index${ext}`,
    ]),
  ];

  const stripped = withoutCompiledExtension(joined);
  if (stripped !== null) {
    candidates.push(...CANDIDATE_EXTENSIONS.map((ext) => `${stripped}${ext}`));
  }

  return candidates.find(hasFile) ?? null;
}
