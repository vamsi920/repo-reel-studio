# Neo hourly module-improvement playbook — CLOUD edition

You are a cloud agent (Anthropic CCR) running unattended, in a fresh checkout of
this repository on `main`. You have no memory of any previous run and no access
to anything outside this repo — all state you need lives inside it, under
`.neo-routine-cloud/`. This is the cloud counterpart of a routine that also runs
locally on the maintainer's machine (`~/.claude/neo-routine/` there); the two are
independent and do not share state — that's expected, not a bug.

State lives in `.neo-routine-cloud/`:
- `state.json` — rotation state for section mode
- `TODO.txt` — the user's own requests, freeform, git-tracked (edit it on GitHub)
- `runs/YYYY-MM-DD.md` — one block per run (append-only)
- `reports/YYYY-MM-DD.md` — written by the separate daily-digest routine

**Critical fact: every push to `main` deploys to production immediately** —
Netlify builds the frontend and `.github/workflows/fly-deploy.yml` deploys the Fly
agent-server and docs engine, neither gated on CI. The safety is the local gate in
step 6 and the revert in step 8. Never push work that has not passed the gate.

---

## 1. Preflight

```bash
git status --porcelain   # should already be empty — fresh checkout
git checkout main && git pull --ff-only
```

If for any reason the tree is not clean, do not stash or force anything — log a
`SKIPPED (dirty tree)` block to `.neo-routine-cloud/runs/$(date -u +%F).md`, commit
just that log addition, push, and stop. This should be rare/never in a fresh
cloud checkout.

Record `BASE_SHA=$(git rev-parse HEAD)`. Read `AGENTS.md` (repo root) before
editing anything.

## 2. Check `.neo-routine-cloud/TODO.txt` first — the user's own requests take priority

Freeform text, git-tracked (the user edits it directly on GitHub or via a PR).
Lines starting with `#` are comments/ignored.

**A todo is not always one line.** Treat items as separated by one or more blank
lines — everything between two blank lines (or start/end of file) that isn't a
`#` comment is ONE item, however many lines or sentences it spans. Don't split
one thought across lines into multiple todos; don't merge two genuinely separate
requests that lack a blank line between them — a fresh imperative verb/subject
starting mid-block is a sign of a second item, use judgment.

1. Read the file, segment into items, skip comments. Take the **first** item in
   full. None at all → skip to step 2b (section mode).
2. **Brainstorm before touching code.** Restate the whole item in 1–2 sentences
   (if the restatement misses something the text asked for, you under-segmented —
   re-read and expand). Find the relevant code, list 2–3 approaches, pick one and
   say why. Record all of this in the run log. If ambiguous, take the most
   conservative reading that still delivers something useful for everything it
   mentioned — never stall waiting for a human.
3. Implement it completely — code plus tests — then steps 5–8 apply.
4. **Only after `git push` succeeds**, delete that item's full text from
   `TODO.txt` in the SAME commit as the work (see step 7) — don't create a
   separate commit just for the TODO edit.
5. If step 8 later reverts, put the item's text back prefixed
   `# BLOCKED <YYYY-MM-DD>: reverted, CI red: <reason>` on its own line, original
   text unchanged below it — as an amendment pushed right after the revert.
6. If the item is over the size cap, or the run is `ABANDONED`, rewrite it in
   place as `# BLOCKED <YYYY-MM-DD>: <reason>` above the original text (comment
   each original line with a leading `# `, never delete). Then, if under ~20
   minutes into the run, fall through to step 2b; otherwise log and stop.
7. A todo run does not consume a section's rotation turn: leave `state.json`
   `sections` untouched, use `todo` as the section key in the log.

## 2b. Section mode — check history, then pick exactly one *different* section

(Only when `TODO.txt` had no live item, or a blocked todo fell through with time
to spare.)

**Always look at what recent runs did before choosing.** Never work the same
section two runs in a row; never let one section dominate.

1. Read `.neo-routine-cloud/state.json`.
2. Read the last ~10 run blocks across `.neo-routine-cloud/runs/` (today's file,
   and yesterday's if today has fewer than 10). Note which sections were used and
   what happened (`SKIPPED` doesn't count as having worked that section).
3. Build the candidate list from the table below, then remove:
   - the section used by the most recent run that actually did work
     (`FIXED`/`IMPROVED`/`FEATURE`/`ABANDONED`/`FINDING`), and
   - any section already worked twice or more in the last 6 working runs, unless
     that would empty the list.
4. From what remains, take entries with the oldest `lastRun` (`null` first). Tie
   → pick at random, don't always take the first row.
5. Write the chosen section, previous section, and a one-line reason into the log.

| Section key | Paths |
|---|---|
| `automations` | `src/components/features/automations`, `src/api/automation-service`, `src/routes/automation*` |
| `agentops` | `src/components/features/agentops`, `src/api/agentops-service`, `scripts/agentops/`, `src/routes/agentops*` |
| `knowledge-kt` | `src/lib/knowledge`, `src/components/features/knowledge`, `src/routes/kt-*` |
| `kt-video` | `src/lib/kt-video`, `src/components/features/kt-video` |
| `codegraph` | `src/lib/codegraph`, `src/components/features/codegraph` |
| `environment-onboarding` | `src/components/features/environment`, `src/components/features/onboarding`, `src/routes/environment-*` |
| `settings` | `src/components/features/settings`, `src/routes/*settings*` |
| `conversation-chat` | `src/components/features/chat`, `src/components/features/conversation*`, `src/components/conversation*` |
| `security` | `src/lib/security`, `src/routes/security.tsx` |
| `auth-data-platform` | `src/components/features/auth`, `src/lib/data-platform`, `supabase/functions` |
| `skills-plugins-mcp` | `src/components/features/skills`, `src/components/features/plugins` |
| `files-terminal-browser` | `src/components/files`, `src/components/terminal`, `src/components/browser` |

## 3. Hunt bugs first

Read the section's source and its tests (top-level `__tests__/` mirrors `src/`).
Look for real defects, not style: wrong conditionals, unhandled rejections, stale
closures, missing cleanup, cold-start/reload races, wrong loading/error states,
bad cache keys, state that survives when it shouldn't. Reproduce with
`npx vitest run <path>` where possible.

## 4. Fix, or improve

- Bugs found → fix up to three, worst first.
- No bugs → make exactly three worthwhile improvements: error handling,
  loading/empty/error states, accessibility, dead-code removal, performance, real
  test coverage. A small, appropriate, fully finished new feature may count as one.
- Add or update tests. Match the surrounding code's style.

## 5. Constraints

- Never edit `.github/workflows/**`, `.env*`, or any secret/credential value.
- Migrations additive only — no `DROP`, no destructive `ALTER`, no data deletion.
- No dependency major bumps; avoid dependency changes unless required.
- Size cap: ~15 files / ~400 changed lines. Bigger → log `FINDING (needs human)`
  and stop instead of doing it.
- New user-facing strings need entries in every `public/locales/*/openhands.json`
  (the pre-commit hook enforces this locally; cloud commits should still add them
  so the hook doesn't fail if run elsewhere and so the UI isn't half-translated).
- Follow `AGENTS.md` and `.agents/skills/custom-codereview-guide.md`.
- Never edit the `HUMAN:` section of any PR description.

## 6. Gate — all four must pass before anything is pushed

```bash
npm run lint && npm test && npm run build && npm run build:lib
```

One repair attempt. Still failing → `git reset --hard $BASE_SHA`, log
`ABANDONED (gate failed)` with the failing command and shortest decisive error
line, push just that log entry, and stop. Never push ungated work.

## 7. Commit and push

One commit containing: the code change, its tests, the `TODO.txt` edit (if in
todo mode), and the `.neo-routine-cloud/state.json` / run-log update (step 9).
Plain Conventional Commits message scoped to the section/area, e.g.
`fix(automations): ...` / `feat(kt-video): ...`. **Do not add any
`Co-Authored-By` trailer or other AI-attribution line.**

Then `git push origin main`. Record the new SHA.

## 8. Watch the deploy, revert if red — best effort

Try:

```bash
gh run list --branch=main --limit 6
```

Poll for up to ~10 minutes if `gh` is available and authenticated. If `ci.yml` or
`fly-deploy.yml` fails on your commit, revert immediately:

```bash
git revert --no-edit <sha> && git push origin main
```

If `gh` is unavailable or unauthenticated in this sandbox, say so plainly in the
log's `ci:` field (`not checked — gh unavailable`) rather than failing the run —
this is best-effort, not a hard requirement.

## 9. Log and update state

Append to `.neo-routine-cloud/runs/$(date -u +%F).md`:

```markdown
## <HH:MM UTC> — <section-key or "todo"> — <FIXED | IMPROVED | FEATURE | SKIPPED | ABANDONED | REVERTED | FINDING>
- mode: <todo | section>
- todo: <original TODO.txt item text, or "-">
- brainstorm: <todo mode only>
- previous run: <section-key of the last run, or "none">
- picked because: <reason>
- base: <BASE_SHA>  commit: <NEW_SHA or ->
- changes:
  - <plain-English one-liner per change>
- gate: lint <pass/fail> · test <pass/fail> · build <pass/fail> · build:lib <pass/fail>
- ci: <green | red -> reverted | not checked — gh unavailable>
- notes: <anything a human should know>
```

Update `.neo-routine-cloud/state.json`: set the worked section's `lastRun` (UTC
ISO) and increment `runCount` (skip this for `mode: todo`); set top-level
`lastSection` to the section key used. Commit this together with the code change
per step 7 — don't create a second commit just for bookkeeping.

Keep the whole run efficient. If running long, finish the gate, push or reset
cleanly, log, and stop — never leave the repo half-edited.
