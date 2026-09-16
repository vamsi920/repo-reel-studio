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

### 2026-09-13 — agentops — AgentOps "workspace" budgets are keyed on the per-conversation working directory, so a monthly workspace budget can never span more than one run and cannot be set before a run starts
- what was observed: `scripts/agentops/collector.mjs` `deriveWorkspaceId()` uses `conversation.workspace.working_dir`, which on the Fly agent-server is `/home/openhands/workspace/project/<conversationId>` — a fresh directory per conversation. Live effect on https://neo.neodevex.com/agentops/budgets: every run gets its own budget card titled with the conversation id, "Monthly workspace budget" and "Used/Remaining/Projected" only ever aggregate that single run, and a per-run budget can only be typed in after the collector has noticed the run (~30s after the message is sent) because the card does not exist before then. The breach → interrupt → approval → resume mechanics themselves work end-to-end (verified with a $0.01 per-run budget), so this is a design/identity question, not a code defect the fixer should guess at.
- why it needs a human: deciding what a "workspace" should mean for governance (repository? user? the whole server? a default policy applied to new conversations?) changes the product semantics of Budgets, Approvals and the Overview tiles, and probably the collector's data model.
- suggested next step: decide one of (a) add a server-wide/default policy row in Budgets that applies to every new run, (b) key workspaces by attached repository (falling back to "no workspace" for scratch chats), (c) keep as-is and rename the card copy to "Conversation budget".

### 2026-09-14 — agentops — AgentOps (and the other NeoDevEx-added modules) are not translated in any of the 14 non-English locales the app offers
- what was observed: every one of the 122 `AGENTOPS$…` keys in `src/i18n/translation.json` carries the identical English string under all 14 non-English locales. The same pattern covers CONNECTOR (116/166 keys), ENVIRONMENT (107/196), PROBE (91/95), AUTOMATIONS (47/283), COMMAND_MENU (42/57), CODEGRAPH (24/35), USAGE (24/39) — the locale files were simply seeded with English for NeoDevEx's own modules. No raw `KEY$…` leaks, so the i18n plumbing itself is fine.
- why it needs a human: whether NeoDevEx's own modules are meant to be localized at all is a product decision, and doing it properly is a bulk translation job (~550 strings × 14 locales), not a bug fix — machine-translating it in an hourly run risks shipping wrong technical wording in 14 languages nobody on the team reads.
- suggested next step: decide one of (a) commission/machine-translate the NeoDevEx module strings in one reviewed batch (AgentOps' 122 keys is the smallest self-contained start), (b) hide non-English options from Settings > Application > Language until (a) happens, (c) accept English-only for these modules.
- update 2026-09-16: related — Arabic is offered in the language picker but nothing sets `dir=rtl` or mirrors layout, so Arabic renders translated text in a fully LTR layout. Same kind of decision: (a) ship real RTL, (b) hide Arabic until then, (c) accept LTR-with-Arabic-text.

### 2026-09-14 — codegraph — a single click on any non-leaf canvas node drills into it, so the details panel for subsystems/folders (Purpose, Dependencies, Used by, Relevant files, "Read docs", "Watch KT") is unreachable by clicking the canvas
- what was observed: `codegraph-canvas.tsx`'s `handleNodeClick` drills down for every node with children and only selects leaves — there is no canvas gesture that merely selects a subsystem or folder (only reachable via search results or another node's Dependencies/Used-by list). This was a deliberate change (commit `050af64`, "drill down into CodeGraph nodes on click") to match the vendored dashboard it's based on.
- why it needs a human: legitimate convention either way, but it silently hides the richest part of the details panel for exactly the nodes it matters most on.
- suggested next step: decide (a) keep click = drill down, add a visible affordance for non-leaf details (info icon, right-click menu), (b) revert to click = select with double-click as drill-down, or (c) remove the unreachable non-leaf panel sections.

### 2026-09-16 — files-terminal-browser — the agent's browser tool reports a dead URL as a successful navigation
- what was observed: navigating to an address nothing listens on, the upstream browser tool (`ghcr.io/openhands/agent-server`) reports `Navigated to: ...` / `is_error: false` and a state shape identical to a real page load — Chromium's own connection-refused error page is indistinguishable from a real one at this layer. The Browser tab shows "Page loaded" for a page that never loaded.
- why it needs a human: the client has no real signal to act on. A proper fix needs an upstream change (the browser tool surfacing navigation errors), or a client-side heuristic (e.g. title equals host + zero interactive elements) that could misfire on real minimal pages — a product trade-off, not a bug fix.
- suggested next step: decide whether to accept this as-is (honest about what the upstream tool reported) or commission the heuristic; if the latter, file it as a code item once decided.

### 2026-09-16 — settings — the sidebar's "Automate" nav label ignores the UI language entirely
- what was observed: switching the UI language translates every sidebar item except "Automate" — traced to `sidebar-rail-body.tsx` preferring a fixed, non-localized label from an external `@openhands/extensions` interface manifest over the app's own (correctly translated) copy, regardless of locale.
- why it needs a human: fixing it means either extending that external manifest's schema to carry per-locale labels (and updating whatever publishes it), having the host ignore the manifest's label for non-English locales, or accepting the branding as intentionally locale-invariant — an architecture/ownership call, not a one-line fix.
- suggested next step: decide the intended behavior; if translation is wanted, extend `InterfaceManifest`'s sidebar shape (`src/manifests/types.ts`) to carry per-locale strings.

---
Note (2026-09-16): the long-running GitHub/Jira OAuth incident, the Supabase
auth/PGRST301 incident, and the agent-server data-loss-on-restart incident that
used to accumulate dozens of reconfirmation entries here have been moved to
`~/.claude/neo-shared/incidents.md` as INC-1, INC-2, and INC-3 — check there,
not here, for their current status.
- re-alerted in chat 2026-09-16 15:30 UTC (neo-focus-explorer run 8, 6-hour repeat of the 09:12 UTC alert; still 'Failing' on /environment/connections, tracked as INC-1 in ~/.claude/neo-shared/incidents.md) — next chat re-alert due ~21:30 UTC if still dead

### <date> — <module> — <one-line summary>
- what was observed:
- why it needs a human:
- suggested next step:
```

---

### 2026-09-13 — agentops — AgentOps "workspace" budgets are keyed on the per-conversation working directory, so a monthly workspace budget can never span more than one run and cannot be set before a run starts
- what was observed: `scripts/agentops/collector.mjs` `deriveWorkspaceId()` uses `conversation.workspace.working_dir`, which on the Fly agent-server is `/home/openhands/workspace/project/<conversationId>` — a fresh directory per conversation. Live effect on https://neo.neodevex.com/agentops/budgets: every run gets its own budget card titled with the conversation id, "Monthly workspace budget" and "Used/Remaining/Projected" only ever aggregate that single run, and a per-run budget can only be typed in after the collector has noticed the run (~30s after the message is sent) because the card does not exist before then. The breach → interrupt → approval → resume mechanics themselves work end-to-end (verified with a $0.01 per-run budget), so this is a design/identity question, not a code defect the fixer should guess at.
- why it needs a human: deciding what a "workspace" should mean for governance (repository? user? the whole server? a default policy applied to new conversations?) changes the product semantics of Budgets, Approvals and the Overview tiles, and probably the collector's data model.
- suggested next step: decide one of (a) add a server-wide/default policy row in Budgets that applies to every new run, (b) key workspaces by attached repository (falling back to "no workspace" for scratch chats), (c) keep as-is and rename the card copy to "Conversation budget".

### 2026-09-14 — agentops — AgentOps (and the other NeoDevEx-added modules) are not translated in any of the 14 non-English locales the app offers
- what was observed: every one of the 122 `AGENTOPS$…` keys in `src/i18n/translation.json` carries the identical English string under all 14 non-English locales. The same pattern covers CONNECTOR (116/166 keys), ENVIRONMENT (107/196), PROBE (91/95), AUTOMATIONS (47/283), COMMAND_MENU (42/57), CODEGRAPH (24/35), USAGE (24/39) — the locale files were simply seeded with English for NeoDevEx's own modules. No raw `KEY$…` leaks, so the i18n plumbing itself is fine.
- why it needs a human: whether NeoDevEx's own modules are meant to be localized at all is a product decision, and doing it properly is a bulk translation job (~550 strings × 14 locales), not a bug fix — machine-translating it in an hourly run risks shipping wrong technical wording in 14 languages nobody on the team reads.
- suggested next step: decide one of (a) commission/machine-translate the NeoDevEx module strings in one reviewed batch (AgentOps' 122 keys is the smallest self-contained start), (b) hide non-English options from Settings > Application > Language until (a) happens, (c) accept English-only for these modules.
- update 2026-09-16: related — Arabic is offered in the language picker but nothing sets `dir=rtl` or mirrors layout, so Arabic renders translated text in a fully LTR layout. Same kind of decision: (a) ship real RTL, (b) hide Arabic until then, (c) accept LTR-with-Arabic-text.

### 2026-09-14 — codegraph — a single click on any non-leaf canvas node drills into it, so the details panel for subsystems/folders (Purpose, Dependencies, Used by, Relevant files, "Read docs", "Watch KT") is unreachable by clicking the canvas
- what was observed: `codegraph-canvas.tsx`'s `handleNodeClick` drills down for every node with children and only selects leaves — there is no canvas gesture that merely selects a subsystem or folder (only reachable via search results or another node's Dependencies/Used-by list). This was a deliberate change (commit `050af64`, "drill down into CodeGraph nodes on click") to match the vendored dashboard it's based on.
- why it needs a human: legitimate convention either way, but it silently hides the richest part of the details panel for exactly the nodes it matters most on.
- suggested next step: decide (a) keep click = drill down, add a visible affordance for non-leaf details (info icon, right-click menu), (b) revert to click = select with double-click as drill-down, or (c) remove the unreachable non-leaf panel sections.

### 2026-09-16 — files-terminal-browser — the agent's browser tool reports a dead URL as a successful navigation
- what was observed: navigating to an address nothing listens on, the upstream browser tool (`ghcr.io/openhands/agent-server`) reports `Navigated to: ...` / `is_error: false` and a state shape identical to a real page load — Chromium's own connection-refused error page is indistinguishable from a real one at this layer. The Browser tab shows "Page loaded" for a page that never loaded.
- why it needs a human: the client has no real signal to act on. A proper fix needs an upstream change (the browser tool surfacing navigation errors), or a client-side heuristic (e.g. title equals host + zero interactive elements) that could misfire on real minimal pages — a product trade-off, not a bug fix.
- suggested next step: decide whether to accept this as-is (honest about what the upstream tool reported) or commission the heuristic; if the latter, file it as a code item once decided.

### 2026-09-16 — settings — the sidebar's "Automate" nav label ignores the UI language entirely
- what was observed: switching the UI language translates every sidebar item except "Automate" — traced to `sidebar-rail-body.tsx` preferring a fixed, non-localized label from an external `@openhands/extensions` interface manifest over the app's own (correctly translated) copy, regardless of locale.
- why it needs a human: fixing it means either extending that external manifest's schema to carry per-locale labels (and updating whatever publishes it), having the host ignore the manifest's label for non-English locales, or accepting the branding as intentionally locale-invariant — an architecture/ownership call, not a one-line fix.
- suggested next step: decide the intended behavior; if translation is wanted, extend `InterfaceManifest`'s sidebar shape (`src/manifests/types.ts`) to carry per-locale strings.

---
Note (2026-09-16): the long-running GitHub/Jira OAuth incident, the Supabase
auth/PGRST301 incident, and the agent-server data-loss-on-restart incident that
used to accumulate dozens of reconfirmation entries here have been moved to
`~/.claude/neo-shared/incidents.md` as INC-1, INC-2, and INC-3 — check there,
not here, for their current status.
