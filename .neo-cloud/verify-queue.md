# Fixes waiting for the focus-explorer to re-check on the live app

One line per pushed fix: `<short sha> — <flow to re-test>`.

---

23b931f — during an active INC-8 auth-timing window (freshly-exported QA session, check within the first ~5 min after login), open /environment/connections and confirm it shows the new "We can't check your connections right now" retry banner (`data-testid="environment-connections-org-error"`) above the provider catalog instead of every card silently rendering a bare, never-connected-looking "Connect" button; click the banner's Retry button and confirm it re-runs the org lookup (no page reload needed) and the banner clears once the glitch self-heals.
