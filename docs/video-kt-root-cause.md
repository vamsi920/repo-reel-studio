# Video KT — Root Cause

## Symptom

Clicking "Watch KT" on a Knowledge page produces no visible error, but the
resulting video is empty or near-empty (no code, no real content).

## Architecture confirmed first

Before assuming a bug, the whole pipeline was traced end-to-end. Confirmed:
this is a **purely client-side, deterministic** pipeline — no LLM call, no
server-side render, no job queue, no video file storage, no database
anywhere in this repo (matches this app's documented "no database, no job
queue, no server of its own" architecture). Clicking "Watch KT" builds a
manifest in-browser (`buildKtManifestFromKnowledgePage`,
`src/lib/kt-video/build-manifest.ts`) from real fetched file content, then
plays it through `@remotion/player`'s `<Player>` — an interactive preview,
not a render-to-file step. This was the right architecture to keep; the bug
is not architectural.

## Root cause

`src/lib/knowledge/workspace-file-reader.ts`'s `readSnapshotFiles` passes
DeepWiki's repository-relative file paths (e.g. `"src/index.ts"`) directly to
`RemoteWorkspace.downloadAsText(path)`, without anchoring them to the
workspace root.

The app's own sibling hook, `src/hooks/query/use-workspace-file-content.ts`
(lines ~164-173), explicitly documents why this is required:

> "The cloud `/file` endpoint downloads via the runtime's
> `/api/file/download`, which rejects relative paths (400 → the cloud API
> swallows it and returns "")."

That hook anchors every path via `getGitPath(...)` before calling the same
underlying endpoint. `workspace-file-reader.ts` skips this step, so every
`downloadAsText` call is very likely rejected.

## Why it fails silently

Each per-file download is wrapped in its own `try/catch`, and a failure
simply `return`s `null` for that file — the function as a whole never
rejects, even if every single file fails. `readSnapshotFiles` resolves to
`{}` with no error.

`buildKtManifestFromKnowledgePage` then degrades silently: its code-scene
loop skips any relevant file with no content (`if (!content?.trim())
continue;`), so zero code scenes are produced. The repo-tree fallback scene
is also always skipped, because the `kt-page.tsx` call site never passes
`repoFiles`. The result is a single ~6-second intro-only "video" with no
error shown anywhere — exactly "not generating at all" from the user's
perspective.

## What was ruled out

- **Not a stuck/hanging promise.** `readSnapshotFiles` always resolves
  (bounded by the SDK's own per-request timeout) — there's no infinite
  spinner, just silently thin output.
- **Not the narration/TTS system.** The Knowledge-page Watch KT path has no
  `SpeechSynthesis`/TTS wiring at all — narration text is rendered as an
  on-screen caption only. (A separate, unrelated conversation-scoped "KT
  Video" tab does use browser `SpeechSynthesis`, but it isn't part of this
  code path.)

## Fix applied

`src/lib/knowledge/workspace-file-reader.ts`'s `readSnapshotFiles` now
anchors every path against the workspace root (via `getGitPath`) before
calling `downloadAsText`, and returns `{ contents, failedPaths }` instead of
silently swallowing every failure. `src/routes/kt-page.tsx`'s `handleWatchKt`
surfaces a toast when a page has relevant files but none could be loaded,
and passes the successfully-loaded paths as `repoFiles` so the repo-tree
fallback scene works when a page has no diagrams.
