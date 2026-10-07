# Neo focus fixer — CLOUD edition, hourly (not every 10 min — see note)

You are a cloud agent in a fresh checkout on `main`. Fixes what
`neo-focus-explorer-cloud` files in `.neo-cloud/findings.txt`.

**Cadence note:** the local version of this routine polled every 10 minutes.
Cloud routines have a 1-hour minimum interval, so this one runs hourly instead
— a filed finding waits up to ~1 hour instead of ~10 minutes before it's
picked up. That's the real trade-off of moving this routine to cloud; nothing
in this playbook can shorten it further.

**Read `.neo-cloud/never-block.md` first — it overrides any SKIP/BLOCKED/ABANDON wording below.**

## Step 0. Incident-first priority

Same as `playbook-hourly-fixer.md`'s step 0: build a buildable mitigation for
an `OPEN` incident first if one exists; otherwise, if `findings.txt`'s first
item is prefixed `MITIGATION for INC-<n>:`, that's this run's top priority.

## 1. Fast exit

```bash
git status --porcelain   # should already be empty — fresh checkout
git checkout main && git pull --ff-only
```

Read `.neo-cloud/findings.txt`. Segment on blank lines. Live items first,
then `# RETRY` items (old `# BLOCKED` = RETRY attempt 1/3). Drop duplicates /
already-fixed-on-main items while reading. Nothing at all → fall back to the
first live item in root-level `.neo-cloud/TODO.txt` that the hourly fixer has
not touched in the last hour (check `git log -1 --format=%cr -- .neo-cloud/TODO.txt`
and today's hourly run log); still nothing → stop.

## 2. Take the first finding and brainstorm

Same rules as the local version: restate the item, find the code, weigh 2–3
approaches, pick one and say why — into the run log. Then read the KT docs for the area you will touch: `docs/kt/INDEX.md` (committed copy; `.neodevex/kt/` if you are in a NeoDevEx workspace) and the relevant `pages/*.md` when present (see the "KT docs first" section of `AGENTS.md`). If a doc and the code disagree, trust the code. If it starts with
`STILL BROKEN after <sha>:`, `git show <sha>` first and choose a different
approach.

## 3. Fix it completely

Code plus tests. Same constraints as `playbook-hourly-fixer.md` step 5 (no
workflows/secrets, additive migrations, ~15 files/~400 lines cap, i18n entries
for new strings, `AGENTS.md`). Plain commit, **no `Co-Authored-By`**.

## 4. Gate

```bash
npm ci
npm run lint && npm test && npm run build && npm run build:lib
```

Judge differentially (only NEW failures vs `BASE_SHA`). One repair attempt;
still failing → `git reset --hard $BASE_SHA`, rewrite the item as `# RETRY
<date> (attempt n/3): <reason> — next try: <smaller scope>` (never-block.md
rule 4), log `ABANDONED`, and try the next item if time allows.

## 5. Push, deploy-check, hand back

```bash
git push origin main
```

Rejected non-fast-forward → `neo-hourly-module-improver-cloud` landed first —
`git fetch && git rebase origin/main`, conflict → never-block.md rule 2; clean → re-run lint + the touched tests,
push again.

Best-effort `gh run list --branch=main --limit 6` if `gh` is available; if
`Deploy to Fly.io` is red on your commit, `git revert --no-edit <sha> && git
push origin main`, put the item back as `# RETRY <date> (attempt n/3): reverted,
deploy red: <reason>`.

If the commit touched `supabase/functions/**`/`supabase/migrations/**`, this
sandbox has no Supabase CLI credentials — log `FIXED (NOT DEPLOYED)` with the
exact `supabase functions deploy ...`/`supabase db push` command in `notes:`,
and hand the item back as `# NOT DEPLOYED <date>: <sha> — run: ...` instead of
deleting it.

Otherwise, **only after the push succeeds**: delete the item's paragraph from
`findings.txt`, append `<short sha> — <flow to re-test>` to
`.neo-cloud/verify-queue.md`.

## 6. Log

Append to `.neo-cloud/runs/focus-fixer-$(date -u +%F).md`:

```markdown
## <HH:MM UTC> — <module> — <FIXED | FIXED (NOT DEPLOYED) | ABANDONED | REVERTED>
- finding: <first ~120 chars>
- brainstorm: <restatement; approaches; chosen one and why>
- base: <BASE_SHA>  commit: <sha or ->
- changes: <plain-English one-liner per change>
- gate: lint <pass/fail> · test <pass/pre-existing fail/NEW fail> · build <…> · build:lib <…>
- deploy: <green | red → reverted | not checked | NOT DEPLOYED — see notes>
- notes: <anything a human should know>
```

Commit this log update together with the fix (or alone, if nothing shipped).
No chat message — the local daily digest reads this repo's `.neo-cloud/`
state directly.
