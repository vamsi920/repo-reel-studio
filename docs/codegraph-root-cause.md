# CodeGraph — Root Cause

## Symptom

CodeGraph's initial (top-level) view shows node labels that look like
DeepWiki wiki section titles ("System Architecture", "Backend Systems")
rather than real codebase structure.

## What was confirmed real (ruling out "no real engine")

`vendor/understand-anything/` (vendored, its own README: "powers NeoDevEx's
Interactive CodeGraph") is a genuine tree-sitter-based static analysis
engine — not a stub. `src/lib/codegraph/analyzer-runner.ts` uploads a
compiled analyzer into the agent-server sandbox and runs it against the
**real repository checkout on disk**
(`src/lib/codegraph/analyzer-entry.ts`): it walks every file, parses each one
with a real tree-sitter grammar, extracts functions/classes/imports, and
resolves real import and call edges via a symbol-owner map. The output —
real files, classes, functions, and typed edges (imports/calls/contains) —
populates every level of the graph **below** the top, confirmed by direct
code reading, not assumption.

## Root cause — narrower than the bug report suggested

`src/lib/codegraph/hierarchy.ts`'s level-1 (top) subsystem grouping tries
DeepWiki section hints **first**: `assignByHints` decides which real file
belongs in which level-1 bucket by checking which wiki section cited that
file, and only files no hint claims fall back to real detected architectural
layers or folder segments. The bucket's display **name** is then always the
DeepWiki section title (`hintById.get(sectionId)?.title`).

This is deliberate, documented design (`deepwiki-bridge.ts`'s module
comment: "Subsystem naming prefers DeepWiki's section titles when
available... reads far better than the folder name") — but it means the
very first screen a user sees is shaped by wiki section membership, not code
structure. Everything one click deeper (modules, files, classes, functions)
is unaffected and already fully code-derived.

## What was ruled out

- "Graph built from Knowledge sections" — false as a general description;
  true only for level-1 grouping/naming specifically.
- "Symbol graph output is discarded" — false; it's consumed at every level
  below level 1, and edges throughout the graph are real.
- "Parser/indexer not running" — false; confirmed invoked end-to-end against
  the real checkout, producing real per-file analysis.
- "No competing/better code-graph implementation exists elsewhere in the
  app that should have been used instead" — confirmed; this is the only
  active `@xyflow/react`-based graph feature, and it's the real one.

## Fix applied

`src/lib/codegraph/hierarchy.ts`'s level-1 grouping now decides bucket
*membership* purely from real detected layers, falling back to real
folder/community clustering (reusing the vendored `deriveContainers` —
the same tool `buildModuleTree` already used one level down, avoiding the
naive "everything under `src/`" collapse a first-path-segment split would
otherwise produce now that this fallback runs far more often). DeepWiki
hints (`assignByHints`, removed) no longer decide membership at all — they
only relabel an already-formed bucket with a friendlier name
(`relabelBucketsWithHints`) when a hint's cited files substantially overlap
that bucket's real files.
