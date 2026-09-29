# Feature-builder state (owned by neo-feature-builder-cloud — don't hand-edit)

goal-hash: a090b5e9ede3
status: building
goal: build a tutorial interactive wizard (with navigations and subtitiles) so that any new user can understand it on the first watch.. and if not new user there shoud be a small button on the left side to start tutorial

interpretation: A first-time user should get a short guided tour of the whole
app — each step takes them to the page it describes and narrates it in a
caption bar at the bottom of the screen ("subtitles"), with Back/Next/Skip and
progress. It auto-plays once for someone who just finished onboarding;
returning users are never interrupted but see a small tab on the left edge of
the screen that replays it. Success = a newcomer who clicks Next through it
knows where chat, customization, automations, environment, AgentOps,
Knowledge and settings live.

design decisions:
- Lives in `src/components/features/tutorial/` (steps, zustand store, wizard, launcher, host); mounted as `<TutorialHost />` next to `<OnboardingHost />` in `src/routes/root-layout.tsx`.
- Steps are data (`getTutorialSteps()`): id, title/subtitle i18n keys, optional route. The wizard navigates via `useNavigation()` on step change (route decoupling rule).
- Caption bar is a non-modal `role="dialog"` pinned bottom-center so the page behind stays visible; subtitle is `aria-live="polite"`. Arrow keys move, Escape skips, Enter advances (Next autofocused).
- "Seen" persisted in localStorage `neo-tutorial-seen` on finish/skip/Escape. Auto-start only when onboarding transitions to completed in this session (same-tab `neo:onboarding-completed` event added to `useOnboardingCompletion`) — users onboarded before this feature just get the launcher.
- Launcher: small GraduationCap tab fixed to the left edge; vertically centered on desktop, pinned below the ~48px mobile top chrome on phones (clear of both the standalone mobile nav bar and the conversation page's own header); hidden while the tour runs and while the mobile nav drawer is open.
- Copy under `TUTORIAL$*` in all 15 locales.
- Mobile spotlight fallback: every routed step's `anchorTestIds` ends with `MOBILE_MENU_TOGGLE_TEST_ID` (`sidebar-mobile-menu-toggle`), so when the real sidebar link is off-screen on a phone (drawer closed) the tour spotlights the hamburger button that reveals it instead of showing no spotlight at all.

milestones:
- [x] 1. MVP: steps + store + caption-bar wizard (Back/Next/Skip/Finish, progress, dots, keys) + left-edge launcher + auto-start after onboarding + i18n + tests — done 2026-09-28
- [x] 2. Spotlight: highlight the sidebar item each step talks about (anchor via data-testid, dim the rest, scroll into view) — done 2026-09-28 (works in expanded + collapsed sidebar; on phones the sidebar is hidden so no spotlight shows — opening the mobile drawer mid-tour deferred to milestone 4)
- [x] 3. Auto-play mode: optional play/pause that advances captions on a timer sized to caption length ("watch" mode), respecting prefers-reduced-motion — done 2026-09-28 (tour starts playing unless reduced motion; 4–15 s per caption by length; thin timer bar; stops on the last step so Finish is deliberate; manual Back/Next restarts the timer)
- [x] 4. Edge cases (part 1): resume position after reload mid-tour + analytics events via useTracking — done 2026-09-29 (open tour's step saved in localStorage `neo-tutorial-progress`, reopened paused at that step on reload and cleared on close; `tutorial_started` {trigger: auto|launcher|resume}, `tutorial_completed`, `tutorial_skipped` {step, step_index, total_steps})
- [x] 4b. Edge cases (part 2a): Cloud backends that skip onboarding — done 2026-09-29 (a Cloud account with a ready LLM never sees onboarding, so the tour now auto-starts for it when the tour was never seen and the account has zero conversations; accounts with history only get the launcher; readiness check shared with OnboardingHost via `onboarding/cloud-llm-readiness.ts`)
- [x] 4c. Edge cases (part 2b): launcher placement on mobile + conversation route, spotlight on mobile — done 2026-09-29 (launcher now sits under the mobile top chrome instead of screen-center, so it can't sit over chat message text, and hides while the mobile nav drawer is open via `useSidebarMobileNav`; every routed step gained `sidebar-mobile-menu-toggle` as its last-resort spotlight anchor so a phone with the drawer closed still highlights the hamburger button instead of showing nothing; 2 new tests)
- [x] 5. a11y + polish (part 1): focus return to launcher on close + accessible tooltip — done 2026-09-29 (TutorialHost sends focus back to the launcher button after finish/skip/Escape, since the wizard's dialog node is gone at that point; the launcher's native `title` was replaced with `StyledTooltip` so the "Start tutorial" label shows in the app's shared tooltip style on hover/focus, keeping `aria-label` for screen readers; 4 new tests)
- [ ] 5b. a11y + polish (part 2): reduced-motion audit (spotlight ring + progress-dot transitions), dark/light tokens review of the caption bar, RTL (ar) check

last commit: feat(tutorial): focus return to launcher and accessible tooltip on close (2026-09-29)
