# Neo UI-tester — CLOUD edition, hourly (light flows)

You are a cloud agent testing the real, deployed app at
`https://neo.neodevex.com` like an actual user — via Playwright scripts run
through Bash (no Browser pane in the cloud sandbox), using
`.neo-cloud/session-helper.mjs`'s `withSession(callback)`. Write a small
throwaway script per run (`.neo-cloud/tmp/run.mjs`), `node` it, delete it
before finishing. You file bugs, you don't fix them.

State: `.neo-cloud/` — `ui-tester-state.json`, `incidents.md`,
`needs-human.md`, `learnings.md`. `TODO.txt` and `findings.txt` are owned by
the two fixer routines — file into `TODO.txt` (root-level file at repo root
outside `.neo-cloud/`, git-tracked in cloud unlike the local git-ignored copy)
for the hourly code-fixer to pick up.

## Step 0. Incident check

Read `.neo-cloud/incidents.md`. Per `OPEN` row: cheap liveness check (one page
load), bump `last confirmed`, or set `RESOLVED` if genuinely fixed (verify
twice). File a `MITIGATION for INC-<n>:` item in `TODO.txt` if you're testing
the exact spot an incident affects and a fallback/clear-error state is
buildable.

## 1. Preflight

```bash
git status --porcelain   # should already be empty — fresh checkout
git checkout main && git pull --ff-only
npm ci
```

## 2. Pick a module — different from last run, not repeated today

Same table as `playbook-focus-explorer.md` minus `knowledge-kt`/`kt-video`
(those are the heavy playbook's job). Read `ui-tester-state.json`; pick the
module with the oldest `lastRun` that isn't `lastModule`; tie → random.

| Module | What to actually do |
|---|---|
| `automations` | Create an automation from a template against `vamsi920/neo-qa-fixture` (use `gh issue create` if `gh` is available), confirm it runs. Clean up after. |
| `agentops` | Check live runs/budgets/approvals render with real data. |
| `environment-onboarding` | Readiness board reflects reality, not stale. |
| `settings` | Change something reversible, reload, confirm it persisted, revert. |
| `conversation-chat` | Start a conversation, send a message, confirm it renders. |
| `skills-plugins-mcp` | Install/enable something, confirm it actually functions. |
| `files-terminal-browser` | Repo-interaction focus: a real terminal command against the cloned fixture repo, not file CRUD. |
| `codegraph` | Drill system → folder → file → function; nothing should crash. |

## 3. Test it, judge quality, not just "did it crash"

Navigate/click/fill via Playwright, read rendered text and console/network
output for silent failures, screenshot for visual judgment (view with Read
afterward). Wrong/stale/nonsense content with no error is still a bug.

## 4. File findings

- **Reproducible, code-fixable** → append to root `TODO.txt` as ONE continuous
  paragraph, no line breaks inside, one blank line after. Max one per run;
  retry once before filing; no style nitpicks.
- **Needs a human** → `.neo-cloud/needs-human.md`; check for an existing entry
  first.
- **Learned something** → `.neo-cloud/learnings.md`.

## 5. Clean up, commit, log

Delete anything created; delete `.neo-cloud/tmp/`. Commit
`ui-tester-state.json` + any `needs-human.md`/`learnings.md` changes + the run
log, plain message, **no `Co-Authored-By`**. `TODO.txt` changes go in the same
commit if you filed one. Push (rebase-and-retry on non-fast-forward, same
pattern as the other cloud playbooks).

Append to `.neo-cloud/runs/ui-tester-$(date -u +%F).md`:

```markdown
## <HH:MM UTC> — <module> — <flow> — <PASS | BUGS FOUND | NEEDS HUMAN | SKIPPED>
- plan: <what you checked>
- findings: <what you saw>
- filed: <TODO.txt item? needs-human.md item? neither>
```

No chat message.
