# Never-block rules — apply to EVERY neo routine, override anything older

Routines run independently. None of them ever waits on, skips for, or is
"blocked by" another routine, a lock, an incident, or a previously failed item.

1. **No locks, no skip-for-others.** There is no `repo.lock`. Cloud runs are
   fresh checkouts; local testers use their own worktree. A dirty tree is
   cleaned (`git reset --hard origin/main && git clean -fd`, keeping
   `node_modules`/`.env*`), never a reason to skip the run.
2. **Push coordination only at push time.** Non-fast-forward → `git fetch
   origin && git rebase origin/main`, up to 3 attempts. Rebase conflict → do
   NOT abandon: `git rebase --abort`, save your diff (`git diff origin/main...HEAD
   > /tmp/p.diff` or re-read your own changes), `git reset --hard origin/main`,
   re-apply the change by hand on fresh main, fast gate (lint + touched tests),
   push. Only log `ABANDONED (rebase)` if the re-apply is genuinely impossible.
3. **Incidents never gate a run.** An OPEN incident only rules out items that
   directly depend on the broken external thing. Pick the next item and keep
   working. Never write "BLOCKED BY PROD INCIDENT" as a whole-run status.
4. **No permanent BLOCKED.** An item that fails is rewritten in place as
   `# RETRY <date> (attempt <n>/3): <reason> — next try: <smaller scope>` above
   its commented original. Fixers treat `# RETRY` items as live on the NEXT
   run (after trying any fresh live item first), and must try the smaller
   scope. After attempt 3 fails, move the text to `needs-human.md` and delete
   it from the todo file. Old `# BLOCKED` lines are treated as `# RETRY
   (attempt 1/3)`.
5. **Own state only.** Each routine writes only its own state/run files
   (`hourly-state.json`, `focus-state.json`, `feature-state.md`, its own
   `runs/*` file). Shared files (`TODO.txt`, `findings.txt`, `incidents.md`)
   are edited with minimal hunks so rebases merge cleanly.
6. **Something always ships.** If the chosen item can't be done, fall through
   to the next item or to a small improvement — a run that could have shipped
   something and logs only SKIPPED is a failure.
