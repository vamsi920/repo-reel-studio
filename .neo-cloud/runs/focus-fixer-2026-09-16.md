# focus-fixer run log — 2026-09-16

## 19:49 UTC — INC-1 mitigation (GitHub repo picker) — MITIGATED
- finding: `findings.txt` had no live item this run, so per step 0 incident-first
  priority I checked `incidents.md` for a buildable mitigation: INC-1 (dead
  GitHub OAuth connection) had `mitigation: none built yet — next routine to
  touch environment-onboarding or automations should add a clear "GitHub
  isn't...
- brainstorm: the repo picker (`GitRepoDropdown`) and its feeder hooks
  (`useGitRepositories`, `useUserProviders`) already had dev-only console
  diagnostics for "connection silently unavailable" but nothing user-visible;
  a dead GitHub connection leaves the repositories query *disabled*, not
  *errored*, so it falls through to the same generic "No Repository" empty
  state as a legitimately-empty, working account. Considered: (1) surface the
  live `/environment/connections` probe status into the picker — most
  accurate but requires wiring a second, unrelated data source into a
  component that doesn't otherwise depend on it, larger blast radius; (2) add
  a `isGithubDisconnected` signal to the existing `useUserProviders` hook
  (which already tracks the local/cloud connection state powering `providers`)
  and thread it through `useRepositoryData`/`GitRepoDropdown` to swap the
  empty-state message; (3) do nothing UI-side and only fix `kt-list.tsx`'s
  "No connected repositories yet" text — rejected, that page isn't fed by
  live GitHub API data at all, so it's a different bug, not this incident.
  Chose (2): smallest diff, reuses data already flowing through the existing
  hook chain, and directly matches the incident's own mitigation text (a
  clear "GitHub isn't connected — reconnect in Environment > Connections"
  message instead of a misleading empty state).
- base: ffaf82935541ca92d5da919f55f68b694a0bc626  commit: (see push below)
- changes: `useUserProviders` now exposes `isGithubDisconnected` (settled +
  not in `providers`, computed separately for cloud vs local backends so a
  still-loading connection never reads as disconnected); `useRepositoryData`
  surfaces `isProviderDisconnected` for the `github` provider; `GitRepoDropdown`
  renders the new `HOME$GITHUB_NOT_CONNECTED` i18n string (all 15 locales) in
  place of the generic empty state when disconnected; added/updated unit
  tests for all three layers; updated INC-1's `incidents.md` row to
  `MITIGATED` (GitHub half only — Jira has no equivalent picker in this app
  and the underlying OAuth reconnect still needs the user).
- gate: lint pass · test pre-existing fail (149/5941 failing identically on
  base commit `ffaf829`, spot-checked `settings-form.test.tsx` and the full
  count — none of the failures are in the touched files/areas; all 33 tests
  in the touched files pass) · build pass · build:lib pre-existing fail
  (`vendor/understand-anything/**` TS6059 rootDir errors, identical on base
  commit `ffaf829`, unrelated to this change — `tsconfig.lib.json`'s rootDir
  doesn't cover `vendor/`)
- deploy: not checked yet (best-effort `gh run list` after push)
- notes: `npm run build:lib` is currently broken on `main` independent of any
  fixer routine's changes (vendor/understand-anything files fall outside
  tsconfig.lib.json's `rootDir: src`), and the full test suite has ~149
  pre-existing failures unrelated to this or most other changes — worth a
  human or a future TODO.txt item fixing `tsconfig.lib.json`'s rootDir/include
  so `build:lib` can gate real changes again. INC-1 stays MITIGATED, not
  RESOLVED — Jira OAuth and the underlying GitHub reconnect still need the
  user's action in Environment > Connections.
