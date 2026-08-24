# Proactivation inside Automations — implementation note

## What already existed

- A full CRUD + run automation subsystem (`src/types/automation.ts`,
  `src/api/automation-service/automation-service.api.ts`,
  `src/hooks/query/use-automations.ts`): an `Automation` is
  `{ name, trigger (cron|event), prompt, repository, model, timeout, plugins }`.
  Each run (`AutomationRun`) carries a `conversation_id` — a run *is* an agent
  conversation, executed through the same agent path as manual chats.
- Cron scheduling (`src/utils/automation-schedule.ts`, daily/weekdays/weekly
  presets), already used by `EditAutomationModal`.
- Prompt-driven PR creation (`getCreatePRPrompt` in `src/utils/utils.ts`) — the
  existing "Create PR" chat button sends an instruction, not a REST call; the
  agent uses its own sandboxed git/gh tools.
- A generic run/detail UI (`src/routes/automation-detail.tsx`) that renders
  prompt, config, plugins, activity, and run history/logs for *any*
  `Automation` record with no per-type code.
- An approval pattern (`ConversationConfirmationButtons` +
  `EventService.respondToConfirmation`) and automation-level confirm modals
  (`EditAutomationModal`, `DeleteConfirmationModal`).
- Workspace memory (`src/api/workspace-memory/*`, `src/lib/workspace-memory/*`)
  — isolated per `workspaceId`, with a durable mirror at
  `.neodevex/memory/records.jsonl` inside the workspace.
- Repo/workspace connection UI (`git-repo-dropdown.tsx`,
  `repo-selection-form.tsx`, `workspace-dropdown/`) that needs no GitHub
  reconnect once a provider is already connected.

The one gap: the Automations *catalog* (the recommended-automations grid and
its generic manifest-driven `SetupDialog`) is entirely sourced from the
external npm package `@openhands/extensions` (`src/manifests/manifest-sources.ts`
— "there is no wiring to add here"), and its field-type schema
(`text|textarea|select|cron|timezone|repo-picker`) can't express multi-repo
selection, watch-area checkboxes, or an autonomy-level chooser. So
Proactivation could not ship as "just another catalog entry."

## What Proactivation reuses directly

- `AutomationService.createAutomation` / `toggleAutomation` — no new backend
  calls.
- `useAutomations`, `useAutomationRunSummaries`, `useDispatchAutomation`,
  `useToggleAutomation` — no new query hooks.
- `automation-detail.tsx`, `ActivityLogSection`, `RunStatusBadge`,
  `RunLogsModal` — unmodified, since a Proactivation automation is an
  ordinary `Automation` record.
- `buildCronSchedule` for the wizard's frequency step.
- `getCreatePRPrompt` for the run-level "Create PR" action.
- `submitMemoryCandidate` (workspace memory) for "Dismiss with a reason."
- `GitProviderDropdown` / `GitRepoDropdown` / `useUserProviders` for repo
  selection — no new GitHub client.

## What was added

- `src/utils/proactivation-prompt.ts` — builds the automation's `prompt`: a
  small JSON marker (parsed back out to drive the UI) followed by a
  natural-language run instruction covering the disciplined
  discover→verify→propose(→fix→PR) flow, evidence requirements, "no fabricated
  findings," duplicate-work avoidance via workspace memory, and the autonomy
  level's exact boundaries (never modifies files at Recommend, never
  pushes/PRs at Prepare Fix, never merges at Create PR).
- `src/components/features/automations/proactivation/proactivation-feature-card.tsx`
  — the highlighted "Proactive Engineering" card at the top of the Automations
  page, in both its not-enabled (Enable button) and enabled (status + actions)
  states. Detects "is this a Proactivation automation" via the prompt marker,
  not a new backend field.
- `src/components/features/automations/proactivation/proactivation-setup-wizard.tsx`
  — the bespoke setup wizard (workspace → repositories → watch areas →
  autonomy level → schedule → review), since the external catalog's setup
  schema can't express this. On submit it creates one `Automation` per
  selected repository (the data model has one `repository: string` per
  automation, so multi-repo selection fans out to multiple automations grouped
  by a shared name prefix + prompt marker) and enables it.
- `src/components/features/automations/proactivation/proactivation-summary-banner.tsx`
  — a small banner on the (otherwise unmodified) automation detail page that
  renders the watch areas/autonomy level as chips instead of raw prompt text.
- Extended `src/components/features/automations/detail/activity-log-item.tsx`
  with Create-PR / Dismiss actions, shown only for completed Prepare-Fix-mode
  Proactivation runs. "Create PR" prefills the create-PR prompt as a draft
  message in the run's conversation (the same mechanism
  `recommended-automations-launcher.tsx` already uses) rather than sending a
  message to a possibly-inactive conversation runtime directly. "Dismiss"
  collects a reason and writes it to workspace memory so future runs can be
  instructed to avoid repeating it.
- 68 new i18n keys (`AUTOMATIONS$PROACTIVATION_*`) in `src/i18n/translation.json`,
  English only (an established pattern — ~100 existing keys are English-only),
  regenerated into `src/i18n/declaration.ts` via `npm run make-i18n`.

## Data model

No backend/schema changes. Everything Proactivation-specific is encoded in
`Automation.prompt`:

```
<!-- neodevex:proactivation {"version":1,"watchAreas":[...],"autonomyLevel":"...","repository":"..."} -->

<natural-language run instruction for the agent>
```

`parseProactivationMarker` / `isProactivationAutomation` in
`proactivation-prompt.ts` are the single source of truth for reading this back
out; nothing else in the app inspects the marker format.

## Known simplifications (first pass)

- The wizard's repo picker doesn't persist which git provider a repository
  belongs to on the `Automation` record (no such field exists), so the
  run-level "Create PR" action assumes GitHub — consistent with the rest of
  this app's GitHub-first PR flow.
- "Next run" isn't computed/fabricated; the feature card shows the frequency
  preset (daily/weekdays/weekly) rather than inventing an exact next-run
  timestamp.
- Run progress is shown via the existing PENDING/RUNNING/COMPLETED/FAILED
  status badge and a link into the live conversation, rather than a new
  stage-tracker UI — the automation-run model has no stage granularity to
  drive one honestly.

---

# Phase 2 — making Automations actually work

## What was broken

Three separate problems, all confirmed against the running stack rather than assumed:

1. **"Automations Unavailable" on a healthy service.** The registry stores one
   host per backend, and this machine's `default-local` entry pointed at
   `http://127.0.0.1:18000` — the bare agent-server, which has **no**
   `/api/automation` routes (verified: 404). The automation service was healthy
   the whole time on `:18001`, reachable through the ingress (`:8000`) and the
   Vite dev proxy (`:3001`). `dev:minimal` registers the agent-server directly,
   and that host survives in localStorage into a full `npm run dev` session, so
   every automation call went to a service that does not serve them.
   Fixed in `automation-service.api.ts`: resolve the automation base URL once by
   probing the registered host, falling back to the app's own origin only when a
   probe proves it answers.
2. **Suggested automations were invisible on the Dashboard.** `automations-list.tsx`
   rendered the launcher only under `{!dashboard && ...}`, so in dashboard mode
   (which the published `interface.json` enables) every ready-made automation sat
   behind the Templates tab. Now rendered on both.
3. **Most templates created nothing.** Only 3 of the 9 published entries had a
   `direct` setup block; the rest opened a seeded chat and persisted nothing.

Two further blockers found only by driving the real UI:

- The setup dialog's **Continue was disabled** whenever a declared integration
  was not installed as an MCP, so none of the new templates could be created.
  Local entries now declare `required: false` (the only value the schema
  permits), which keeps the integration visible and explained without blocking.
- The Proactivation wizard's repo dropdown is **always empty on a local backend**
  (`GitService` returns an empty page unless the backend is cloud), so the wizard
  could not be completed. It now falls back to typing `owner/repo`, matching
  `manifest-form-field.tsx`.

## Deployment reality that shaped the design

`GET /v1/capabilities` on this deployment reports:

```
triggerKinds: ["cron"]        eventSources: []      eventTypes: []
features: [conversationDispatch, kvStore, mcpTools, presetPlugin, presetPrompt, repoClone]
cron.minIntervalSeconds: 60   maxAutomationTimeoutSeconds: 1800
```

There is **no event/webhook support at all** here, and no `webhookDelivery`
feature. Every locally-authored entry therefore polls on cron, and none declares
`requires.features` — a feature the deployment does not report renders the card
unavailable, which is worse than a card that runs.

## What was added

- `src/manifests/local-automation-catalog.ts` — 12 fork-owned entries, all
  `direct` + cron, so completing a form performs one
  `POST /api/automation/v1/preset/prompt` and returns a live automation.
  Five are new (Proactive Engineering, Continuous Improvement Agent, GitHub Issue
  Fixer, Dependency Updater, CI Failure Fixer); seven replace published entries
  that only opened a chat.
- A merge seam in `manifest-sources.ts`. The setup registry keeps **both**
  published and local entries — the package pins contract fixtures against ids
  it publishes, and those must keep resolving — while the displayed catalog drops
  a published entry that a local one supersedes, so no duplicate cards appear.
- `create-automation-form.tsx` — a real "New automation" form (name,
  instructions, repository, schedule, model, timeout, enabled) replacing the
  previous instructions-only dead end. The conversation route is still offered.
- A "Creates automation" / "Guided chat" badge on every card, and a test
  asserting every displayed entry is `direct` so a future package bump cannot
  silently reintroduce a dead card.

## Verified end to end against the live service

- Created an automation via `POST /v1/preset/prompt` → returned `enabled: true`
  with a real cron trigger, tarball and entrypoint.
- Dispatched it → the run went `PENDING → RUNNING → COMPLETED` and was assigned a
  real `bash_command_id` and `conversation_id`, i.e. the service genuinely
  spawned an agent conversation in the sandbox.
- Drove the **GitHub Issue Fixer** template through the browser: prerequisites →
  form → review → confirm created a real automation and landed on its detail page
  showing "Active" with the fully interpolated prompt, confirmed present and
  enabled via `GET /v1`.
- Both verification automations were deleted afterwards.
