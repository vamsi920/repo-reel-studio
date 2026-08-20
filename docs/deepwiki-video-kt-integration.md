# DeepWiki-Open Integration + Video KT

This document describes how repository-level Knowledge Transfer ("KT") is
built into NeoDevEx: `AsyncFuncAI/deepwiki-open` (MIT) provides repository
understanding, and NeoDevEx's existing deterministic video pipeline
(built for the per-conversation KT Video tab) provides the presentation
layer. Per project convention, this document leads with what already
existed and what was reused before describing what's new.

## 1. What NeoDevEx already had (inspected before writing any code)

The current app (`src/`) is a React Router v7 SPA with `ssr: false` — it has
**no database, no job queue, and no server of its own**. It talks to two
external Python services, neither vendored in this repo: an `agent-server`
package (pulled via `uvx` at dev-server start, see `scripts/dev-with-automation.mjs`)
and an `openhands.automation` package for webhooks/automations. Supabase and
Firebase configuration exist only under `legacy/` (an earlier, now-retired
version of this product) and are not wired into the live app.

Given that, the closest existing precedents this integration builds on:

| Concern | Existing NeoDevEx piece |
|---|---|
| Repo connection / auth | Conversation `selected_repository`/`selected_branch`, `useCreateConversation` — no GitHub credentials touched by this feature |
| Local checkout | Agent-server sandbox checkout (already happens when a conversation attaches a repo) — its `workspace.working_dir` is an absolute path on the agent-server host |
| Commit resolution | `AgentServerGitService.getGitCommits(conversationUrl, sessionApiKey, gitPath)` — a plain static method, callable outside conversation-route context |
| File content by path | `RemoteWorkspace.downloadAsText(path)` from `@openhands/typescript-client` — the same typed client the rest of the app uses, given explicit `host`/`apiKey` (via `getAgentServerClientOptions`) instead of route-bound React context |
| Async job UX | `AppConversationStartTask` / `AutomationRun` — the "poll a task until terminal status" pattern this app already has, applied here to DeepWiki's own task machine (see §3) |
| Deterministic video manifest | `src/lib/kt-video/build-manifest.ts` (`buildKtManifest`) — built earlier this session for the per-conversation KT Video tab; extended, not replaced |
| Remotion rendering, narration | `src/components/features/kt-video/kt-video-composition.tsx`, `src/routes/kt-video-tab.tsx` (`useSceneNarration`, browser `SpeechSynthesis`) |
| Markdown rendering | `src/components/features/markdown/markdown-renderer.tsx` (`react-markdown` + `remark-gfm` + sanitize) |
| List+detail page shell | `src/routes/automations-list.tsx` / `automation-detail.tsx` — flat sibling routes, `max-w-4xl mx-auto` card layout |
| Sidebar nav pattern | `src/components/features/sidebar/sidebar-rail-body.tsx`'s `<SidebarNavLink>` list |

**Architectural gap found**: file access in this app (`useWorkspaceFiles`,
`useWorkspaceFileContent`) is entirely conversation-route-scoped. There was
no repository-level (route-independent) file-content access path before
this feature — `src/lib/knowledge/workspace-file-reader.ts` is the new
piece that closes that gap, using the SDK's `RemoteWorkspace` class with
explicit connection details instead of React context.

## 2. What was vendored (RULE 2)

Only DeepWiki-Open's FastAPI backend (`api/`) was vendored, at
`vendor/deepwiki-open/api/` — its Next.js frontend was not vendored, since
NeoDevEx builds its own Knowledge UI. See `THIRD_PARTY_NOTICES.md` for the
upstream commit SHA, license, and copyright notice, and `vendor/deepwiki-open/LICENSE`
for the full MIT text. One local bug fix was made — see §3.1.

## 3. Why the integration is a thin adapter, not a fork with heavy patches (RULE 3 / RULE 4)

Direct inspection of the real DeepWiki-Open source (`api/schemas/repo.py`,
`api/routers/wiki.py`) found it already satisfies both of NeoDevEx's hard
requirements:

- **Local-snapshot analysis, no second GitHub auth.** `RepoInfo.type` is
  `Literal["local", "github", "gitlab", "bitbucket"]`; when `type: "local"`,
  `repo_url` is treated as an absolute local path rather than cloned. NeoDevEx
  passes the agent-server sandbox's already-checked-out `working_dir` here —
  DeepWiki never sees or needs a GitHub token for this flow.
- **A real async job API**, so NeoDevEx didn't need to build a job queue:
  `POST /wiki/tasks` (submit, get-or-create — joins an active task or returns
  a cached result instead of duplicating work), `GET /wiki/tasks/{id}`
  (poll), `GET /wiki/tasks/{id}/stream` (Server-Sent Events). Its `TaskStatus`
  enum is `pending → indexing → determining_structure → generating →
  completed|failed`.

This is why the integration is a thin adapter (`DeepWikiKnowledgeEngine`)
calling DeepWiki's existing public API, not a fork with heavy local patches.

### 3.1 File tree formatting in the structure prompt

Generated docs were noticeably more generic than comparable tools (broad
section names like "Data Layer & Persistence" instead of names grounded in
the repo's actual module boundaries). Root cause, found in
`api/services/wiki/tasks.py`'s `_determine_structure`: the file list
`read_repo_file_tree` returns (a plain `list[str]`) was being handed directly
to `build_structure_prompt`, whose f-string interpolates it as-is — so the
LLM was reading a Python list repr (`['src/App.tsx', 'src/routes/...', ...]`)
instead of a real file tree, with no line breaks to signal directory
grouping. Also fixed in the same call: the four `included_files` /
`included_dirs` / `excluded_files` / `excluded_dirs` arguments were being
passed in the wrong order relative to `read_repo_file_tree`'s signature
(harmless today since NeoDevEx never sets any of them, but a real bug if that
changes). Fixed by joining the file list into a sorted, newline-separated
string before it reaches the prompt, and correcting the argument order.

### 3.2 Virtualenv directories with version-suffixed names weren't excluded

`api/config.py`'s `_should_process_file` matched `excluded_dirs` (e.g.
`.venv/`) by exact path-component name. A virtualenv named `.venv313` (a
common convention for projects supporting multiple Python versions) slipped
through untouched, dumping thousands of third-party library files into both
the RAG index and the wiki-structure prompt — on one repo this inflated a
single structure-determination request from ~2.6k tokens to 90k+ tokens and
the underlying vector index from 527 real documents to 54,155. Fixed by
adding `_VENV_DIR_RE` (`^\.?(venv|virtualenv|env)[\d.\-_]*$`), matched
against every path component alongside the literal excluded_dirs list —
narrow enough not to catch real source directories like `environment` or
`envs`.

### 3.3 Page content was written from READMEs, not the declared source files

`_generate_page` built each page's prompt from a markdown *link list* of
`page.filePaths` — it never read the files, despite the prompt itself
claiming "you have access to the full content of these files." The model,
with no real code in context, fell back to whatever thin RAG context it
retrieved (skewed toward READMEs). Verified on real output: a page with 3
declared source files cited the README for 100% of its citations and never
touched any of the 3 files it was supposed to document.

Fixed by reading each `page.filePaths` entry off disk (reusing
`api/services/codemap.py`'s `read_repo_file`, which already has a
path-traversal guard) and inlining the real, line-numbered content into the
prompt in place of the link list (`_build_file_contents_block` in
`api/services/wiki/tasks.py`), with a token-budget cap (largest files
truncated first) so one page with many/large declared files can't blow the
context window. `build_page_prompt` (`api/services/wiki/prompts.py`) gained
a `file_contents` parameter and its instructions were updated to match what
is actually provided.

### 3.4 Runaway generations corrupting pages

Four pages in one run were 10-100x their normal size (one hit 1,023,481
characters vs. a normal ~11k) due to a single-run of >150,000 whitespace
characters starting inside a markdown table — a known LLM degenerate-
repetition failure mode, unbounded because the Google Gemini streamer
(`api/chat/_stream.py`) set no `max_output_tokens` and `generator.json` ran
every Gemini model at `temperature: 1.0`, both wrong for a task requiring
deterministic, verbatim citations and syntactically valid Mermaid. Fixed by
setting `max_output_tokens: 8192` and `temperature: 0.3` for all three
Gemini models in `generator.json` (read by `_stream.py`'s
`GoogleGenerativeChatStreamer`), plus a last-resort safety net in
`post_process_wiki_content` (`api/services/wiki/content.py`) that collapses
any run of 200+ consecutive whitespace characters.

## 4. Integration boundary

```
src/lib/knowledge/knowledge-engine.ts
  RepositoryKnowledgeEngine        — the interface
  DeepWikiKnowledgeEngine          — the only implementation today
  RepositorySnapshot               — { repositoryId, owner, repo, branch, commitSha, localPath }
  KnowledgeRepository/Section/Page — NeoDevEx's normalized types (never DeepWiki's own)
```

`DeepWikiKnowledgeEngine.generate(snapshot)`:
1. `POST /wiki/tasks` with `{ repo_url: snapshot.localPath, type: "local", owner, repo, provider: "google", model }` — reuses NeoDevEx's existing Gemini profile, no second LLM credential.
2. Streams `GET /wiki/tasks/{id}/stream` until `completed`/`failed`.
3. Normalizes the resulting `WikiStructureModel`/`WikiPage[]`/`WikiSection[]` into `KnowledgeRepository`/`KnowledgePage`/`KnowledgeSection`:
   - Mermaid diagrams are extracted from DeepWiki's inline ` ```mermaid ` fences (it doesn't emit a separate diagrams field) into `KnowledgeDiagram[]`, classified by a cheap keyword heuristic over the *real* diagram source — never regenerated.
   - `importance` (a loose `str` on DeepWiki's side, per its own source comment) is coerced to `"high"|"medium"|"low"` with a safe fallback.
   - `filePaths: string[]` become `RelevantFile[]` (path only — DeepWiki doesn't carry line ranges; those are added later, from real files, by the video layer — see §5).

Everything downstream of this adapter (the Knowledge UI, the video layer)
consumes only NeoDevEx's normalized types.

## 5. Video layer

`KtScene` (existing type, extended with a `type` discriminator:
`intro|concept|architecture|code|flow|diagram|repo-tree|recap`) and a new
`buildKtManifestFromKnowledgePage(page, fileContents, repoFiles)` in the
same `build-manifest.ts` file:

- One `intro` scene from the page's title/description.
- One `architecture`/`flow`/`diagram` scene per real Mermaid diagram on the
  page (pre-rendered to SVG once via the `mermaid` npm package at manifest-build
  time, cached, never re-drawn by an LLM).
- One `code` scene per relevant file, reusing the *existing*
  `extractSymbols`/`roleForPath` logic to find a real symbol and line range in
  the real file content (fetched for the exact commit via
  `workspace-file-reader.ts`) — this is where line-level grounding comes
  from, since DeepWiki's own output doesn't include it.
- A closing `recap` scene via the existing `buildSummaryScene`.

**No LLM call anywhere in this path** — 100% deterministic, matching
`build-manifest.ts`'s existing philosophy. The spec's LLM-driven scene
planner (turning a page into a richer manifest with its own judgment calls)
is intentionally deferred to a v2 — this vertical slice proves the pipeline
end-to-end with the already-proven deterministic builder first.

New Remotion components: `diagram-panel.tsx` (shared by architecture/flow/diagram
scene types — they differ only in narration, not visual treatment) and
`repo-tree-panel.tsx`, both reusing the existing `.instrument-panel`/`.ame-card`
chrome and `interpolate`-based fade-in `CodePanel` already used.

## 6. UI

- **Sidebar**: a 4th `<SidebarNavLink>` ("Knowledge", `/kt`), same pattern as
  the existing Automations link.
- **`/kt`**: repositories already connected to NeoDevEx (derived from real
  conversation history — no second repo picker), each with a "Generate
  Knowledge" button.
- **`/kt/:repositoryId`**: the section/page hierarchy exactly as DeepWiki
  generated it for that repo — never a fixed sample structure.
- **`/kt/:repositoryId/:pageId`**: `[Read] [Watch KT]`. Read renders the
  page's real markdown through the existing `MarkdownRenderer`, with a
  Mermaid-aware `code` component override (`mermaid-code-block.tsx`) so
  fenced diagram blocks render as the real diagram instead of syntax-highlighted
  text. Watch KT builds and plays the video on first click.

## 7. Persistence (RULE — reuse, no new database)

For this vertical slice, generated `KnowledgeRepository` data lives in an
in-memory Zustand store (`src/stores/knowledge-store.ts`) keyed by
`repositoryId` — it does not survive a page reload. This is an explicit,
documented scope cut, not an oversight: the natural persistence path (write
the normalized JSON into the same conversation workspace DeepWiki analyzed,
read it back through the existing `useWorkspaceFileContent` hook — the exact
mechanism every other artifact in this app already uses) is straightforward
to add once the generation pipeline itself is proven against a real
DeepWiki instance, and is called out here as the immediate next step rather
than spec'd out further.

## 8. Known limitations / v2 follow-ups

- **Same-filesystem requirement.** The `type: "local"` integration only
  works when the DeepWiki process and the agent-server sandbox share a
  filesystem — true for local dev / same-host deployment (this app's only
  deployment mode today), not for a multi-host production topology. A future
  iteration would need either a shared volume or DeepWiki's own
  git-clone-by-URL path with a short-lived, scoped token.
- **No persistence** (see §7).
- **No LLM-driven scene planner** (see §5) — scenes are chosen by fixed rules
  (one per diagram, one per relevant file), not by an LLM judging what a
  viewer most needs to see.
- **Selective auto-generation** (only render video for Project Overview +
  top architecture page + a few more `high`-importance pages automatically,
  "Generate KT Video" on demand for the rest) is not yet implemented — every
  page's video is generated on-demand today, which already avoids the
  "render everything automatically" failure mode the spec warns against,
  just without the auto-play-for-top-pages convenience layer on top.

## 9. Running DeepWiki-Open locally

```bash
cd vendor/deepwiki-open
poetry install
poetry run uvicorn api.main:app --port 8001
```

Set `VITE_DEEPWIKI_SERVICE_URL` if not using the default `http://localhost:8001`.
DeepWiki needs LLM credentials of its own for the `provider`/`model` it's
called with — this integration passes `provider: "google"`, reusing
whichever Gemini credentials are already configured for NeoDevEx, per the
same environment variable convention DeepWiki's own README documents for
its Google provider.
