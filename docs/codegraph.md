# Interactive CodeGraph

CodeGraph is the third way to understand a workspace repository, alongside the
two that already existed:

| Surface      | Route                    | What it does                                  |
| ------------ | ------------------------ | --------------------------------------------- |
| **Docs**     | `/kt/:repositoryId`      | DeepWiki-generated pages (existing)           |
| **Video KT** | `/kt/:repositoryId/video`| Links into the existing watch mode (existing) |
| **CodeGraph**| `/kt/:repositoryId/graph`| Interactive, hierarchical graph (new)         |

All three hang off one repository snapshot — same workspace, same repository,
same commit — via `KnowledgeTabs`
(`src/components/features/knowledge/knowledge-tabs.tsx`).

CodeGraph is **not** a new sidebar item; Knowledge owns it.

## Why the graph is hierarchical

A raw graph of this repository is ~2,550 files and ~6,780 symbols. Rendering
that is the failure mode the feature exists to avoid, so the analyzer
aggregates it into levels:

```
System > Subsystem > Module > File/Class > Function
```

with extra module levels inserted wherever a folder is too big, so **no level
exceeds `MAX_LEVEL_CHILDREN` (24) aggregate nodes**. On this repository the
system view is 13 subsystems.

Two grouping strategies, in order (`src/lib/codegraph/hierarchy.ts`):

1. **Folder segments** — primary, because it is inherently hierarchical and
   stable across analyses. Each level splits on the next path segment below its
   parent's prefix.
2. **Vendored `deriveContainers`** (folder LCP → Louvain communities) — used
   only for nodes with no file path, where connectivity clustering is the
   better answer.

A flat folder holding hundreds of files falls back to alphabetical buckets
(`A–F`, `G–M`, …). Ugly, but navigable, which 500 nodes on one canvas is not.

### Subsystem naming comes from DeepWiki

Subsystem names are taken from DeepWiki's section titles where they match, so
the top level reads "Payment Service" rather than `src/pay`. Fallbacks:
detected layers (API/Service/Data/UI/Utility) → top-level folder → "Other".

When two sections cite the same file, the **more focused** section wins (fewer
cited files). Without that rule a sprawling "Architecture Overview" page would
swallow the whole repository into one subsystem.

## Where analysis runs

**In the agent-server sandbox, not the browser.** The checkout is already on
that filesystem; parsing in the browser would mean an HTTP round trip per file.
This mirrors how DeepWiki already reads the sandbox checkout
(`docs/deepwiki-video-kt-integration.md` §3).

```
scripts/build-codegraph-analyzer.mjs   →  public/codegraph-analyzer/
                                            analyze.mjs            (esbuild bundle)
                                            node_modules/web-tree-sitter/…
                                            grammars/*.wasm
                                            manifest.json
```

`src/lib/codegraph/analyzer-runner.ts` then:

1. probes `node --version` in the sandbox (**preflight**),
2. uploads the payload to `.neodevex/codegraph/` and **verifies it landed**,
3. uploads `hints.json` (the DeepWiki subsystem hints),
4. runs `analyze.mjs`, parsing JSON-lines progress off stdout,
5. reads the sharded output back.

Build it with `npm run build:codegraph-analyzer`; `build:app` runs it too.

Grammars shipped: TypeScript/TSX, JavaScript, Python, Go, Java, Rust. Other
languages degrade gracefully (upstream's plugin skips them per-language). Dart
and Swift are excluded on licensing grounds — see `THIRD_PARTY_NOTICES.md`.

## Sharded output, lazy loading

The analyzer writes per-level shards so the browser downloads the small system
view first and a subtree only on drill-down:

```
.neodevex/codegraph/out/<commitSha>/
  meta.json                  CodeGraphMeta (~4 KB)
  levels/root.json           the system view (~32 KB on this repo)
  levels/<shard>.json        one per expandable node
  search.json                compact tuples, fetched lazily on first search
```

Shard file names come from `src/lib/codegraph/shard-name.ts`, shared by the
analyzer and the browser so they cannot disagree. Long ids are **hashed, not
truncated** — truncation would collide sibling deep paths and silently render
one folder's contents under another.

Breadcrumbs travel inside each shard, so opening a deep level never requires
the full parent index client-side.

## Version and staleness

A graph belongs to `workspaceId` + `repositoryId` + `commitSha`
(`codeGraphKey`). The workspace id *is* the checkout directory
(`RepositorySnapshot.localPath`) — the same thing `RemoteWorkspace` and
`getGitPath` already key on, rather than a parallel identifier nothing else
recognises.

On every open, HEAD is re-resolved via the existing
`AgentServerGitService.getGitCommits` and compared
(`src/lib/codegraph/staleness.ts`):

- **fresh** — graph commit matches HEAD
- **stale** — banner shown, re-analysis offered; the graph is never presented
  as describing current code
- **unknown** — HEAD could not be resolved. Reported honestly rather than
  assumed fresh, because silence would be indistinguishable from a match.

Re-opening a repository reuses an existing analysis **only** for that exact
commit (`openExistingAnalysis`).

## Background events

`src/lib/codegraph/activity.ts` emits the platform `WorkspaceActivityEvent`
shape with `source: "codegraph"`, and only these milestones:

```
CodeGraph: analyzing repository
CodeGraph: building relationships
CodeGraph: mapped 640 files and 2,400 symbols
CodeGraph: graph ready
CodeGraph: analysis failed
```

Never per-node or per-file — that would make the activity feed useless.

The shared `WorkspaceActivityService` does not exist yet, so `publish()` fans
out to local subscribers. **When that service lands, only `publish()` changes**
— no call site does.

## Deeplinks into Knowledge

`src/lib/codegraph/deepwiki-bridge.ts` maps nodes to Knowledge pages by file
path. A node with a matching page gets **[Read documentation]** and
**[Watch KT]**; ties break toward the more important, then more focused page.

**A node with no matching page gets no link and no invented page** — structural
facts only. This is asserted by a test.

`[Watch KT]` points at `/kt/:repositoryId/:pageId?view=watch`. That query
parameter is the *only* change made to the Video KT path: `kt-page.tsx` opens
in watch mode when it is present. Nothing under `src/lib/kt-video/` or
`src/components/features/kt-video/` was touched.

## Vendoring

The graph engine is `Egonex-AI/Understand-Anything` (MIT), vendored at
`vendor/understand-anything/`. See that directory's `README.md` for exactly
what was and was not taken, the per-directory licensing caveats, and the
update procedure; `THIRD_PARTY_NOTICES.md` carries the formal notice.

Per `docs/deepwiki-video-kt-integration.md` §4, **no NeoDevEx component imports
vendor types**. Everything downstream consumes the normalized types in
`src/lib/codegraph/codegraph-types.ts`, so a vendor bump cannot ripple into the
UI.

## Verification

```bash
npm run build:codegraph-analyzer
npx vitest run __tests__/lib/codegraph __tests__/stores/codegraph-store.test.ts \
  __tests__/components/features/codegraph __tests__/components/features/knowledge
```

To exercise the analyzer directly against any checkout:

```bash
node public/codegraph-analyzer/analyze.mjs \
  --repo . --out /tmp/cg --commit "$(git rev-parse HEAD)" \
  --workspace ws --repository owner/repo \
  --grammars public/codegraph-analyzer/grammars
```
