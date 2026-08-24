# Knowledge Quality — Root Cause

## Symptom

Every repository produces a near-identical wiki taxonomy: Overview, System
Architecture, Core Features, Data Management/Flow, Frontend Components,
Backend Systems, Model Integration, Extensibility and Customization —
regardless of what the repository actually contains.

## Root cause

`vendor/deepwiki-open/api/services/wiki/prompts.py`'s `_COMPREHENSIVE_STRUCTURE`
constant hardcodes this exact list as a prose instruction to the model:

> "Create a structured wiki with the following main sections: Overview /
> System Architecture / Core Features / Data Management/Flow / Frontend
> Components / Backend Systems / Model Integration / Deployment/Infrastructure
> / Extensibility and Customization."

This is not a neutral placeholder or a loose example — it's a direct anchor.
`WikiTaskRequest.comprehensive` defaults to `True`
(`vendor/deepwiki-open/api/schemas/repo.py`) and NeoDevEx's client
(`src/lib/knowledge/knowledge-engine.ts`) never overrides it, so this exact
template runs on every single generation. The 8 categories users see are 8 of
these 9 labels, reordered by the model — confirmed by diffing real generated
output against this prompt text.

## Compounding factor

Structure determination is a **single LLM call** that sees only the file
tree and README (`_determine_structure` in
`vendor/deepwiki-open/api/services/wiki/tasks.py`) — no real source code, no
symbol/import/call evidence. Even without the hardcoded list, the model has
weak grounding to invent a repository-specific taxonomy from; a flat list of
file paths and prose naturally converges on generic software-architecture
categories.

## What was ruled out

- **Not stale caching.** The four bugs fixed earlier this session (file-tree
  formatting, virtualenv exclusion, missing file-content inlining, unbounded
  generation) are all confirmed live and working correctly — this is a fifth,
  separate, previously-unfixed issue.
- **Not a frontend override.** No hardcoded taxonomy exists anywhere in
  `src/` — `normalizeStructure`/`normalizePage` pass DeepWiki's section/page
  titles through verbatim.
- **Not a symbol-analysis gap that requires new tooling.** A real
  tree-sitter-based analysis engine already exists in this repo
  (`vendor/understand-anything/`, powers CodeGraph) — it was simply never
  consulted by Knowledge generation.

## Fix applied

See `docs/deepwiki-video-kt-integration.md` §§3.5-3.8 for the exact,
file-level changes: the hardcoded taxonomy was removed from the prompt
(§3.5), a condensed summary of the existing CodeGraph analyzer's real output
now feeds structure determination as evidence (§3.7), the wiki cache/task
key was fixed to include commit SHA with a `force` bypass for manual
regeneration (§3.6), and the model's own per-page rationale is no longer
discarded before reaching the frontend (§3.8).
