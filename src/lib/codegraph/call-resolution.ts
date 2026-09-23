/**
 * Resolves which file actually defines a called function, for the analyzer's
 * cross-file call-graph edges (`analyzer-entry.ts`).
 *
 * A function name can collide across unrelated files (two files can each
 * define a function called `handle`). The analyzer's cross-file map
 * (`functionOwner`) breaks that ambiguity with "first definition wins" —
 * necessarily arbitrary, since nothing else distinguishes the candidates.
 *
 * But when the *calling* file itself defines a function with that name, the
 * ambiguity doesn't exist: that is unambiguously the real target, regardless
 * of what some other, earlier-processed file happens to also call `handle`.
 * Falling through to the global map in that case would draw a false
 * cross-file dependency — exactly the "wrong edge" the global map's own
 * fallback comment says is worse than a missing one.
 */
export function resolveCalleeFile(
  callerPath: string,
  calleeName: string,
  localFunctionNames: readonly string[],
  functionOwner: ReadonlyMap<string, string>,
): string | null {
  if (localFunctionNames.includes(calleeName)) return callerPath;
  return functionOwner.get(calleeName) ?? null;
}
