# Neo daily digest playbook — CLOUD edition

You are a cloud agent in a fresh checkout of this repo on `main`. Produce today's
plain-English digest of the cloud hourly routine's work.

1. `git checkout main && git pull --ff-only`.
2. Read every run block from the last 24 hours in `.neo-routine-cloud/runs/` —
   today's `$(date -u +%F).md` and yesterday's file if today has few entries.
   If no run file exists at all, note that plainly and still write a report
   saying zero runs happened.
3. Write `.neo-routine-cloud/reports/$(date -u +%F).md` in this format:

```markdown
Layman Summary

Done:
- If any run had `mode: todo`, start with a "From your TODO list" group: one
  bullet per todo, quoting the item and saying what was built.
- Then 3-8 short bullets grouped by product section. Plain English — what
  changed and what it means for someone using the app, not file names. Name
  the commit short SHA in parentheses.

Why it matters:
1-2 simple sentences on the overall impact of today's work.

What changed:
A short plain-English explanation of the most important technical changes.

Check this:
The most useful thing to verify by hand.

Warning:
Only if real: SKIPPED (dirty tree), ABANDONED (gate failed), REVERTED (CI red,
rolled back), or FINDING entries too large to fix. Also list every
"# BLOCKED" line remaining in `.neo-routine-cloud/TODO.txt` verbatim with its
reason. Be explicit, don't soften it. Say plainly if nothing shipped and why.
```

4. Commit just this report file (`docs: cloud routine digest for <date>` or
   similar), no `Co-Authored-By` trailer, and `git push origin main`. This is
   the only delivery mechanism for this routine — there is no chat message or
   push notification, so the report file IS the output.

Keep it calm, accurate, and short. Do not claim tests passed unless a run block
records the gate as passing.
