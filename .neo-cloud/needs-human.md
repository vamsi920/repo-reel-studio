# Neo UI-tester — needs a human decision

Issues found that aren't code-fixable — a design call, a third-party account
issue, an ambiguous product decision. **Standing production incidents (a dead
credential, a broken external service, an infra problem) do NOT go here — they
go in `~/.claude/neo-shared/incidents.md` instead.** See
`~/.claude/neo-shared/blocked-item-format.md` for which file a given problem
belongs in, and the severity/dedup rules. This file is for one-off judgment
calls only.

The daily digest lists everything below. Once you've acted on (or decided to
ignore) an entry, delete it. Before adding a new entry, check none already
covers the same underlying question — add `- seen again <date>` instead of a
duplicate.

## Format for each entry

```
### <date> — <module> — <one-line summary>
- what was observed:
- why it needs a human:
- suggested next step:
```

---
