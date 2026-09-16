# Shared format rules — referenced by every playbook, defined once here

## Standing production incidents → `~/.claude/neo-shared/incidents.md`

Use this when the block is **external and recurring**: a dead credential, a
misconfigured third-party service, an infra/deploy problem — something that
will still be broken next hour no matter how many times it's rediscovered.

Row format:
```
### INC-<n> — <CRITICAL|HIGH> — <one-line summary>
- status: OPEN | MITIGATED | RESOLVED
- affects: <module(s)/feature(s)>
- first seen: <date>   last confirmed: <date>   confirmed by: <routine>
- needs from user: <exact concrete action, or "nothing — code will handle it">
- mitigation: <what was built to soften it, or "none possible/needed yet">
- evidence: <the shortest decisive proof — one log line, one error code>
```

Severity rubric:
- **CRITICAL** — a core feature is unusable for a real user right now (not just
  the test account), or the root cause could plausibly affect all users (auth,
  payments, data loss).
- **HIGH** — a real feature is degraded or intermittently broken, or affects
  only automation/test infrastructure rather than real users directly.

Rules:
- **Check before you write.** Read the whole file first. If a row already
  describes the same underlying problem, don't add a new one — do the cheap
  liveness check, update `last confirmed` (and `status`/`evidence` only if
  something actually changed).
- Never delete a row yourself. Only the daily digest moves `RESOLVED` rows out
  (to an archive), and only after confirming twice.
- If you can build a mitigation this run (a clear error state instead of a
  silent/misleading one, a fallback, a disabled entry point with an
  explanation) — do it, mark `mitigation:`, set status `MITIGATED`. Never mark
  `RESOLVED` yourself for something that needs the user's action — only they
  can close INC rows whose `needs from user` isn't "nothing".

## One-off code-fixable bugs → `TODO.txt` (root) / `~/.claude/neo-focus/findings.txt`

Use this when a **specific run of the app** hit a **one-time, code-fixable**
defect — not a standing external incident. **Mandatory format:** the entire
item (summary, what you did, what you expected, what happened, suspected file)
is **ONE continuous paragraph — no line breaks at all inside it, not even one**,
because these files split on blank lines. End with exactly one blank line, then
nothing else from this run. Max one item per run per file. Retry once before
filing; never file flakes or style nitpicks.

An item that can't be done (too big, gate failed) is rewritten in place as
`# BLOCKED <date>: <reason>` above its commented-out (`# `-prefixed) original —
never deleted, never left live to be retried forever.

## One-off design/ambiguity questions → `~/.claude/neo-ui-tester/needs-human.md`

Use this only for a genuine one-time judgment call (not a recurring incident —
those go in `incidents.md`). Format already defined in that file's own header;
check for an existing entry on the same topic before adding a new one (append
`- seen again <date>` instead of duplicating).
