# Fixes waiting for the focus-explorer to re-check on the live app

One line per pushed fix: `<short sha> — <flow to re-test>`.

---

23b931f — during an active INC-8 auth-timing window (freshly-exported QA session, check within the first ~5 min after login), open /environment/connections and confirm it shows the new "We can't check your connections right now" retry banner (`data-testid="environment-connections-org-error"`) above the provider catalog instead of every card silently rendering a bare, never-connected-looking "Connect" button; click the banner's Retry button and confirm it re-runs the org lookup (no page reload needed) and the banner clears once the glitch self-heals.

af1facd — diagnostic-only, not a behavior fix: reproduce the Watch KT "Open this repository's conversation to watch KT" block per the repro steps in findings.txt's RETRY item (open a repo's Knowledge page, start a fresh live conversation for the same repo+branch, hard-reload the `/kt/<repositoryId>/...?view=watch` URL, click Watch KT) with the browser devtools console open, and confirm a `[kt-repository] live rehydration failed <repositoryId> <error>` line now appears instead of the failure being silent — that log line is the next run's starting point for the real root-cause fix.
