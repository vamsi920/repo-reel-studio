# Neo UI-tester — CLOUD edition, heavy (KT docs/video), every 4 hours

Same login (`.neo-cloud/session-helper.mjs`), same incident-check, same
filing rules as `playbook-ui-tester.md` — read that file's steps 0, 1, 4, 5 and
reuse them verbatim. This file covers only what's different: judging
Knowledge/KT doc and video generation quality, against `vamsi920/neo-qa-fixture`.

## Pick a module

Alternate `knowledge-kt` / `kt-video` via `ui-tester-state.json`, never
repeating the last one.

## `knowledge-kt`

1. Open Knowledge/KT for the fixture repo via Playwright. Generate if missing
   (real cost — expected at this cadence, at most once per day).
2. Read the generated content (`page.locator(...).innerText()` or similar) and
   screenshot the page(s) — view with Read. Judge: organized into real
   modules matching the fixture's actual structure (validation, task, storage,
   three commands)? Diagrams present and correct, not generic filler? Visually
   well-formatted? Actually describes this repo, not boilerplate?

## `kt-video`

1. Open video KT for the fixture repo. Generate if missing (once/day max).
2. **Frames**: `page.evaluate(() => { const v = document.querySelector("video"); v.currentTime = X; v.pause(); })` at several timestamps, screenshot each, view with Read — judge broken/blank/mismatched frames.
3. **Narration**: read `src/lib/kt-video/narrate-manifest.ts`'s output for this
   repo (the per-scene script with timing) and judge its accuracy against the
   fixture's real code — this replaces listening.
4. **Audio integrity**: get the audio asset URL from a network response
   (`page.on("response", ...)`), download it (`curl`), and check with
   `ffmpeg -i <file> -af volumedetect -f null - 2>&1 | grep -E "mean_volume|max_volume"`
   **if `ffmpeg` is available in this sandbox** — if not, skip this specific
   check and say so in the run log rather than failing the run.
5. **Duration sanity**: not ~0s, not absurd for a fixture this small.

## Cost discipline

Don't regenerate existing output — judge what's there. Only regenerate if
testing regeneration itself is the point, or existing output is missing/broken.
